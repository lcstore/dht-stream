console.time('init')
const deepEqual = require('deep-equal')
const path = require('path')
const sha1 = require('simple-sha1')
const BitField = require('bitfield')
const parallelLimit = require('run-parallel-limit')

const ClientInstant = require('./client')
const StateInstant = require('./state')
const StorageInstant = require('./storage')
const Indexer = require('./indexer')
const utils = require('./utils')
const config = require('./../config')
const ipc = require('./../render/ipc-renderer')
const torrentPoster = require('./../render/lib/torrent-poster')
const CustomWebConn = require('./WebConn')
const debug = require('debug')('dhtstream:client')
const parseTorrent = require('parse-torrent')

let client = null
let server = null
let prevProgress = null


const ClientListener = module.exports = {
    init
}

function init(cb) {
    ClientInstant.getClient((err, newClient) => {
        if (err) {
            utils.error('getClient:cause:' + err)
            return cb(err)
        } else {
            client = newClient
            initEvents(() => {
                StateInstant.load(cb)
            })
        }
    })
}

function initEvents(cb) {
    listenToClientEvents()

    ipc.on('wt-start-torrenting', (e, torrentKey, torrentID, path, fileModtimes, selections, tOptions) =>
        startTorrenting(torrentKey, torrentID, path, fileModtimes, selections, tOptions))
    ipc.on('wt-stop-torrenting', (e, infoHash) =>
        stopTorrenting(infoHash))
    ipc.on('wt-pause-torrenting', (e, infoHash) =>
        pauseTorrenting(infoHash))
    ipc.on('wt-resume-torrenting', (e, infoHash) =>
        resumeTorrenting(infoHash))
    ipc.on('wt-create-torrent', (e, torrentKey, options) =>
        createTorrent(torrentKey, options))
    ipc.on('wt-save-torrent-file', (e, torrentKey) =>
        saveTorrentFile(torrentKey))
    ipc.on('wt-generate-torrent-poster', (e, torrentKey) =>
        generateTorrentPoster(torrentKey))
    ipc.on('wt-get-audio-metadata', (e, infoHash, index) =>
        getAudioMetadata(infoHash, index))
    ipc.on('wt-start-server', (e, infoHash) =>
        startServer(infoHash))
    ipc.on('wt-stop-server', (e) =>
        stopServer())
    ipc.on('wt-select-files', (e, infoHash, selections) =>
        selectFiles(infoHash, selections))
    ipc.on('wt-render-to', (e, infoHash, index, element, options, cb) =>
        renderTo(infoHash, index, element, options, cb))

    ipc.send('ipcReadyWebTorrent')

    window.addEventListener('error', (e) => {
            if (e.message || e.stack) {
                ipc.send('wt-uncaught-error', { message: e.message, stack: e.stack })
            } else {
                ipc.send('wt-uncaught-error', e)

            }
        },
        true)

    setInterval(updateTorrentProgress, 1000)
    console.timeEnd('init')
    cb()
}

function listenToClientEvents() {
    client.on('warning', (err) => ipc.send('wt-warning', null, err.message))
    client.on('error', (err) => ipc.send('wt-error', null, err.message))
}

// Starts a given TorrentID, which can be an infohash, magnet URI, etc.
// Returns a WebTorrent object. See https://git.io/vik9M
function startTorrenting(torrentKey, torrentID, path, fileModtimes, selections, tOptions) {
    console.log('starting torrentKey:%s,torrentID:%s', torrentKey, torrentID)

    var options = tOptions || {}
    options.path = path

    const torrent = client.add(torrentID, options)
    torrent.key = torrentKey

    // Listen for ready event, progress notifications, etc
    addTorrentEvents(torrent)

    // Only download the files the user wants, not necessarily all files
    torrent.once('ready', () => selectFiles(torrent, selections))
}

function stopTorrenting(infoHash) {
    console.log('--- STOP TORRENTING: ', infoHash)
    const torrent = client.get(infoHash)
    if (torrent) torrent.destroy()
}

function pauseTorrenting(infoHash) {
    console.log('--- PAUSE TORRENTING: ', infoHash)
    const torrent = client.get(infoHash)
    if (torrent && !torrent.done) torrent.pause()
}

function resumeTorrenting(infoHash) {
    console.log('--- RESUME TORRENTING: ', infoHash)
    const torrent = client.get(infoHash)
    if (torrent && torrent.paused) torrent.resume()
}

// Create a new torrent, start seeding
function createTorrent(torrentKey, options) {
    console.log('creating torrent', torrentKey, options)
    const paths = options.files.map((f) => f.path)
    const torrent = client.seed(paths, options)
    torrent.key = torrentKey
    addTorrentEvents(torrent)
    ipc.send('wt-new-torrent')
}

function addTorrentEvents(torrent) {
    torrent.on('warning', (err) =>
        ipc.send('wt-warning', torrent.key, err.message))
    torrent.on('error', (err) =>
        ipc.send('wt-error', torrent.key, err.message))
    torrent.on('infoHash', () =>
        ipc.send('wt-infohash', torrent.key, torrent.infoHash))
    torrent.on('metadata', torrentMetadata)
    torrent.on('ready', torrentReady)
    torrent.on('done', torrentDone)
    // torrent.on('download', piecePuts)
    // torrent.on('wt-piece-gets', pieceGets)
    torrent.on('wire', onWire)
    torrent.on('peer', onCustomWebSeedPeer)

    function torrentMetadata() {
        const info = getTorrentInfo(torrent)
        ipc.send('wt-metadata', torrent.key, info)

        updateTorrentProgress()
    }

    function onCustomWebSeedPeer(peerId) {
        var newPeer = torrent._peers[peerId]
        if (!newPeer || newPeer.type != 'webSeed') return
        const conn = newPeer.conn
        const customConn = new CustomWebConn(conn.url, conn._torrent)
        conn.httpRequest = function(pieceIndex, offset, length, cb) {
            Indexer.pieceGet(torrent.infoHash, pieceIndex, (err, value) => {
                if (value && value.data) {
                    var buf = new Buffer(value.data, "base64");
                    debug('pieceGet=%s,pieceIndex=%d,length=%d', torrent.infoHash, pieceIndex, buf.length)
                    torrent.putBits.set(pieceIndex, true)
                    return cb(null, buf)
                } else {
                    return customConn.httpRequest(pieceIndex, offset, length, cb)
                }
            })
        }

    }

    function onWire(wire, addr) {
        function remainBlock(piece) {
            if (!piece) return 0
            return piece._chunks - piece._reservations
        }
        wire.on('piece', (index, offset, buffer) => {
            if (remainBlock(torrent.pieces[index]) > 2) return
            process.nextTick(function() {
                piecePut(index, offset, buffer)
            })
        })
        torrent.putBits = new BitField(torrent.pieces.length)
    }

    function piecePut(index, offset, buf) {
        if (!torrent.putBits || torrent.putBits.get(index)) return
        sha1(buf, function(hash) {
            if (hash === torrent._hashes[index]) {
                // put once
                Indexer.piecePut(torrent.infoHash, index, buf, (err) => {
                    if (err) {
                        console.error("piecePut[" + torrent.infoHash + "," + index + "]", err);
                    } else {
                        debug('piecePut=%s,pieceIndex=%d,length=%d', torrent.infoHash, index, buf.length)
                    }
                })
            } else {
                debug('piecePut=%s,pieceIndex=%d,length=%d,hashErr', torrent.infoHash, index, buf.length)
            }
        })
    }

    function torrentReady() {
        const info = getTorrentInfo(torrent)
        ipc.send('wt-ready', torrent.key, info)
        ipc.send('wt-ready-' + torrent.infoHash, torrent.key, info)

        torrent.discovery.removeAllListeners('error')
      
        updateTorrentProgress()
    }



    function torrentDone() {
        const info = getTorrentInfo(torrent)
        ipc.send('wt-done', torrent.key, info)
        torrent.putBits = null
        updateTorrentProgress()

        // torrent.getFileModtimes(function(err, fileModtimes) {
        //     if (err) return onError(err)
        //     ipc.send('wt-file-modtimes', torrent.key, fileModtimes)
        // })
    }
}

// Produces a JSON saveable summary of a torrent
function getTorrentInfo(torrent) {
    return {
        infoHash: torrent.infoHash,
        magnetURI: torrent.magnetURI,
        name: torrent.name,
        path: torrent.path,
        files: torrent.files.map(getTorrentFileInfo),
        bytesReceived: torrent.received
    }
}

// Produces a JSON saveable summary of a file in a torrent
function getTorrentFileInfo(file) {
    return {
        name: file.name,
        length: file.length,
        path: file.path
    }
}

// Every time we resolve a magnet URI, save the torrent file so that we can use
// it on next startup. Starting with the full torrent metadata will be faster
// than re-fetching it from peers using ut_metadata.
function saveTorrentFile(torrentKey) {
    const torrent = getTorrent(torrentKey)
    const torrentPath = path.join(config.TORRENT_PATH, torrent.infoHash)
    var parsedTorrent = parseTorrent(torrent.torrentFile)
    if (parsedTorrent.announce) {
        parsedTorrent.announce = parsedTorrent.announce.filter(function(url) {
            if (url.indexOf('localhost') > 0 || url.indexOf('lezomao.com') > 0 ) return false
            return url.indexOf('wss://') === 0 || url.indexOf('ws://') === 0
        })
    }

    if (parsedTorrent.urlList) {
        parsedTorrent.urlList = parsedTorrent.urlList.filter(function(url) {
            if (url.indexOf('localhost') > 0 || url.indexOf('lezomao.com') > 0 ) return false
        })
    }
    var torrentFile = parseTorrent.toTorrentFile(parsedTorrent)

    var sTorrentFile = torrentFile.toString('base64')
    // utils.info('torrent.torrentFile:' + sTorrentFile.length + ',data:' + sTorrentFile)
    // StorageInstant.set(torrentPath, sTorrentFile, config.STORAGE_TIMEOUT_MILLS)
    Indexer.metaPut(torrent.infoHash, sTorrentFile, (err) => {})

    ipc.send('wt-file-saved', torrentKey, torrent.infoHash)
}

// Save a JPG that represents a torrent.
// Auto chooses either a frame from a video file, an image, etc
function generateTorrentPoster(torrentKey) {
    const torrent = getTorrent(torrentKey)
    torrentPoster(torrent, function(err, buf, extension) {
        if (err) return console.log('error generating poster: %o', err)
        // save it for next time
        mkdirp(config.POSTER_PATH, function(err) {
            if (err) return console.log('error creating poster dir: %o', err)
            const posterFileName = torrent.infoHash + extension
            const posterFilePath = path.join(config.POSTER_PATH, posterFileName)
            fs.writeFile(posterFilePath, buf, function(err) {
                if (err) return console.log('error saving poster: %o', err)
                // show the poster
                ipc.send('wt-poster', torrentKey, posterFileName)
            })
        })
    })
}

function updateTorrentProgress() {
    const progress = getTorrentProgress()
    // TODO: diff torrent-by-torrent, not once for the whole update
    if (prevProgress && deepEqual(progress, prevProgress, { strict: true })) {
        return /* don't send heavy object if it hasn't changed */
    }
    ipc.send('wt-progress', progress)

    prevProgress = progress
}

function getTorrentProgress() {
    // First, track overall progress
    const progress = client.progress
    const hasActiveTorrents = client.torrents.some(function(torrent) {
        return torrent.progress !== 1
    })

    // Track progress for every file in each torrent
    // TODO: ideally this would be tracked by WebTorrent, which could do it
    // more efficiently than looping over torrent.bitfield
    const torrentProg = client.torrents.map(function(torrent) {
        const fileProg = torrent.files && torrent.files.map(function(file, index) {
            const numPieces = file._endPiece - file._startPiece + 1
            let numPiecesPresent = 0
            for (let piece = file._startPiece; piece <= file._endPiece; piece++) {
                if (torrent.bitfield.get(piece)) numPiecesPresent++
            }
            return {
                startPiece: file._startPiece,
                endPiece: file._endPiece,
                numPieces,
                numPiecesPresent
            }
        })
        return {
            torrentKey: torrent.key,
            ready: torrent.ready,
            progress: torrent.progress,
            downloaded: torrent.downloaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            numPeers: torrent.numPeers,
            length: torrent.length,
            // bitfield: torrent.bitfield,
            files: fileProg
        }
    })

    return {
        torrents: torrentProg,
        progress,
        hasActiveTorrents
    }
}

function startServer(infoHash) {
    // nodejs only
    // const torrent = client.get(infoHash)
    // if (torrent.ready) startServerFromReadyTorrent(torrent)
    // else torrent.once('ready', () => startServerFromReadyTorrent(torrent))
}

function startServerFromReadyTorrent(torrent, cb) {
    if (server) return

    // start the streaming torrent-to-http server
    server = torrent.createServer()
    server.listen(0, function() {
        const port = server.address().port
        const urlSuffix = ':' + port
        const info = {
            torrentKey: torrent.key,
            localURL: 'http://localhost' + urlSuffix,
            networkURL: 'http://' + networkAddress() + urlSuffix
        }

        ipc.send('wt-server-running', info)
        ipc.send('wt-server-' + torrent.infoHash, info)
    })
}

function stopServer() {
    if (!server) return
    server.destroy()
    server = null
}

console.log('Initializing...')

function getAudioMetadata(infoHash, index) {
    const torrent = client.get(infoHash)
    const file = torrent.files[index]

    // Set initial matadata to display the filename first.
    const metadata = { title: file.name }
    ipc.send('wt-audio-metadata', infoHash, index, metadata)

    const options = { native: false, skipCovers: true, fileSize: file.length }
    const onMetaData = file.done
        // If completed; use direct file access
        ?
        mm.parseFile(path.join(torrent.path, file.path), options)
        // otherwise stream
        :
        mm.parseStream(file.createReadStream(), file.name, options)

    onMetaData
        .then(function(metadata) {
            console.log('got audio metadata for %s (length=%s): %o', file.name, file.length, metadata)
            ipc.send('wt-audio-metadata', infoHash, index, metadata)
        }).catch(function(err) {
            return console.log('error getting audio metadata for ' + infoHash + ':' + index, err)
        })
}

function renderTo(torrentOrInfoHash, index, element, options, cb) {
    // Get the torrent object
    let torrent
    if (typeof torrentOrInfoHash === 'string') {
        torrent = client.get(torrentOrInfoHash)
    } else {
        torrent = torrentOrInfoHash
    }
    if (!torrent) {
        throw new Error('renderTo: missing torrent ' + torrentOrInfoHash)
    }
    const renderFile = torrent.files[index]
    renderFile.renderTo(element, options, cb)
}

function selectFiles(torrentOrInfoHash, selections) {
    // Get the torrent object
    let torrent
    if (typeof torrentOrInfoHash === 'string') {
        torrent = client.get(torrentOrInfoHash)
    } else {
        torrent = torrentOrInfoHash
    }
    if (!torrent) {
        throw new Error('selectFiles: missing torrent ' + torrentOrInfoHash)
    }
    // Selections not specified?
    // Load all files. We still need to replace the default whole-torrent
    // selection with individual selections for each file, so we can
    // select/deselect files later on
    if (!selections) {
        selections = torrent.files.map((x) => true)
    }

    // Selections specified incorrectly?
    if (selections.length !== torrent.files.length) {
        throw new Error('got ' + selections.length + ' file selections, ' +
            'but the torrent contains ' + torrent.files.length + ' files')
    }

    // Remove default selection (whole torrent)
    torrent.deselect(0, torrent.pieces.length - 1, false)

    // Add selections (individual files)
    for (let i = 0; i < selections.length; i++) {
        const file = torrent.files[i]
        if (selections[i]) {
            file.select()
        } else {
            console.log('deselecting file ' + i + ' of torrent ' + torrent.name)
            file.deselect()
        }
    }
}

// Gets a WebTorrent handle by torrentKey
// Throws an Error if we're not currently torrenting anything w/ that key
function getTorrent(torrentKey) {
    const ret = client.torrents.find((x) => x.key === torrentKey)
    if (!ret) throw new Error(`Can't resolve torrent key ${torrentKey}`)
    return ret
}

function onError(err) {
    console.log(err)
}

// TODO: remove this once the following bugs are fixed:
// https://bugs.chromium.org/p/chromium/issues/detail?id=490143
// https://github.com/electron/electron/issues/7212
window.testOfflineMode = function() {
    console.log('Test, going OFFLINE')
    client = window.client = new WebTorrent({
        tracker: false,
        dht: false,
        webSeeds: false
    })
    listenToClientEvents()
}