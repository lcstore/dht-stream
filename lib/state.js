const { EventEmitter } = require('events')
const parallelLimit = require('run-parallel-limit')
const config = require('../config')
const StorageInstant = require('./storage')
const Indexer = require('./indexer')

const State = module.exports = Object.assign(new EventEmitter(), {
    getDefaultPlayState,
    load,
    saveImmediate
})

function getDefaultState() {
    const LocationHistory = require('location-history')

    return {
        /*
         * Temporary state disappears once the program exits.
         * It can contain complex objects like open connections, etc.
         */
        client: null,
        /* the WebTorrent client */
        server: null,
        /* local WebTorrent-to-HTTP server */
        prev: { /* used for state diffing in updateElectron() */
            title: null,
            progress: -1,
            badge: null
        },
        location: new LocationHistory(),
        window: {
            bounds: null,
            /* {x, y, width, height } */
            isFocused: true,
            isFullScreen: false,
            title: config.APP_WINDOW_TITLE
        },
        selectedInfoHash: null,
        /* the torrent we've selected to view details. see state.torrents */
        playing: getDefaultPlayState(),
        /* the media (audio or video) that we're currently playing */
        devices: {},
        /* playback devices like Chromecast and AppleTV */
        dock: {
            badge: 0,
            progress: 0
        },
        modal: null,
        /* modal popover */
        errors: [],
        /* user-facing errors */
        nextTorrentKey: 1,
        /* identify torrents for IPC between the main and webtorrent windows */

        /*
         * Saved state is read from and written to a file every time the app runs.
         * It should be simple and minimal and must be JSON.
         * It must never contain absolute paths since we have a portable app.
         *
         * Config path:
         *

         */
        saved: {}
    }
}


/* Whenever we stop playing video or audio, here's what we reset state.playing to */
function getDefaultPlayState() {
    return {
        infoHash: null,
        /* the info hash of the torrent we're playing */
        fileIndex: null,
        /* the zero-based index within the torrent */
        location: 'local',
        /* 'local', 'chromecast', 'airplay' */
        type: null,
        /* 'audio' or 'video', could be 'other' if ever support eg streaming to VLC */
        currentTime: 0,
        /* seconds */
        duration: 1,
        /* seconds */
        isReady: false,
        isPaused: true,
        isStalled: false,
        lastTimeUpdate: 0,
        /* Unix time in ms */
        mouseStationarySince: 0,
        /* Unix time in ms */
        playbackRate: 1,
        volume: 1,
        subtitles: {
            tracks: [],
            /* subtitle tracks, each {label, language, ...} */
            selectedIndex: -1,
            /* current subtitle track */
            showMenu: false /* popover menu, above the video */
        },
        aspectRatio: 0 /* aspect ratio of the video */
    }
}

function saveImmediate() {
    // body...
}

function load(cb) {
    setupStateSaved(onSavedState)

    function onSavedState(err, saved) {
        if (err) return cb(err)
        const state = getDefaultState()
        state.saved = saved
        cb(null, state)
    }
}


function setupStateSaved(cb) {
    const path = require('path')
    const parseTorrent = require('parse-torrent')

    const torrentDict = {}
    const saved = {
        prefs: {
            downloadPath: config.DEFAULT_DOWNLOAD_PATH,
            isFileHandler: false,
            openExternalPlayer: false,
            externalPlayerPath: null,
            startup: false,
            autoAddTorrents: false,
            torrentsFolderPath: '',
            highestPlaybackPriority: true
        },
        torrents: [], // 
        torrentsToResume: [],
        version: config.APP_VERSION /* make sure we can upgrade gracefully later */
    }


    var funcDict = {}

    Indexer.metaAllKeys(null, (err, indexKeys) => {
        if (indexKeys) {
            indexKeys.forEach((readKey) => {
                funcDict[readKey] = function(icb) {
                    Indexer.metaGetId(readKey, (err, value) => {
                        addTorrent(value.data)
                        icb()
                    })
                }

            })
        }
        parallelLimit(funcDict, 2, function(err, result) {
            for (var key in torrentDict) {
                saved.torrents.push(torrentDict[key])
            }
            // console.log('saved:' + JSON.stringify(saved));
            cb(null, saved)
        })
    })


    function addTorrent(sTorrentFile) {
        if (!sTorrentFile) {
            return
        }
        var torrentFile = new Buffer(sTorrentFile, 'base64')
        var parsedTorrent = parseTorrent(torrentFile)
        var torrent = createTorrentObject(parsedTorrent)
        torrentDict[torrent.infoHash] = torrent
    }

    function createTorrentObject(parsedTorrent) {
        // torrentID: torrentFile > torrentFileName > magnetURI > infoHash
        return {
            status: 'paused',
            infoHash: parsedTorrent.infoHash,
            // name: parsedTorrent.name,
            // displayName: t.name,
            posterFileName: parsedTorrent.infoHash + '.jpg',
            // torrentFileName: parsedTorrent.infoHash + '.torrent', 
            magnetURI: parseTorrent.toMagnetURI(parsedTorrent),
            files: parsedTorrent.files,
            // selections: parsedTorrent.files.map((x) => true),
        }
    }
}