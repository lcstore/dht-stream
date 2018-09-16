const fs = require('fs')
const path = require('path')

const { TorrentKeyNotFoundError } = require('../lib/errors')
const TorrentSummary = require('../lib/torrent-summary')

const ipcRenderer = require('./../ipc-renderer')

const instantIoRegex = /^(https:\/\/)?instant\.io\/#/
const infoHashRegex = /xt=urn:btih:([0-9a-zA-Z]{20,})/i

// Controls the torrent list: creating, adding, deleting, & manipulating torrents
module.exports = class TorrentListController {
    constructor(state) {
        this.state = state
    }

    // Adds a torrent to the list, starts downloading/seeding.
    // TorrentID can be a magnet URI, infohash, or torrent file: https://git.io/vik9M
    addTorrent(torrentId, tOptions) {
        if (torrentId.path) {
            // Use path string instead of W3C File object
            torrentId = torrentId.path
        }

        // Trim extra spaces off pasted magnet links
        var infoHash
        if (typeof torrentId === 'string') {
            torrentId = torrentId.trim()
            if (infoHashRegex.test(torrentId)) {
                infoHash = RegExp.$1
            }
        }
        // Allow a instant.io link to be pasted
        // if (typeof torrentId === 'string' && instantIoRegex.test(torrentId)) {
        //   torrentId = torrentId.slice(torrentId.indexOf('#') + 1)
        // }
        const torrentSummary = TorrentSummary.getByKey(this.state, infoHash);
        TorrentSummary.getTorrentId(torrentSummary, (err, tid) => {
            let torrentKey
            if (torrentSummary != null && torrentSummary.torrentKey != null && torrentSummary.torrentKey >= 0) {
                torrentKey = torrentSummary.torrentKey
            } else {
                torrentKey = this.state.nextTorrentKey++
            }
            torrentId = tid || torrentId

            const path = this.state.saved.prefs.downloadPath
            const fileModtimes = null
            const selections = null
            ipcRenderer.send('wt-start-torrenting', torrentKey, torrentId, path, fileModtimes, selections, tOptions)

            dispatch('backToList')
        })

    }

    // Creates a new torrent and start seeeding
    createTorrent(options) {
        const state = this.state
        const torrentKey = state.nextTorrentKey++
            ipcRenderer.send('wt-create-torrent', torrentKey, options)
        state.location.cancel()
    }

    // Starts downloading and/or seeding a given torrentSummary.
    startTorrentingSummary(torrentKey) {
        const s = TorrentSummary.getByKey(this.state, torrentKey)
        if (!s) throw new TorrentKeyNotFoundError(torrentKey)
        // New torrent: give it a path
        if (!s.path) {
            // Use Downloads folder by default
            s.path = this.state.saved.prefs.downloadPath
            // console.log("s.path:" + JSON.stringify(s.path));
            return start()
        }

        function start() {
            ipcRenderer.send('wt-start-torrenting',
                s.torrentKey,
                TorrentSummary.getTorrentId(s),
                s.path,
                s.fileModtimes,
                s.selections)
        }
    }

    // TODO: use torrentKey, not infoHash
    toggleTorrent(infoHash) {
        const torrentSummary = TorrentSummary.getByKey(this.state, infoHash)
        if (torrentSummary.status === 'paused') {

            // torrentSummary.status = 'new'
            // this.startTorrentingSummary(torrentSummary.torrentKey)
            this.resumeTorrent(torrentSummary)
            return
        }

        this.pauseTorrent(torrentSummary, true)
    }

    pauseAllTorrents() {
        this.state.saved.torrents.forEach((torrentSummary) => {
            if (torrentSummary.status === 'downloading' ||
                torrentSummary.status === 'seeding') {
                torrentSummary.status = 'paused'
                // console.log("pauseAllTorrents:%s, wt-stop-torrenting", torrentSummary.infoHash);
                // ipcRenderer.send('wt-stop-torrenting', torrentSummary.infoHash)
                this.pauseTorrent(torrentSummary)
            }
        })
    }

    resumeAllTorrents() {
        this.state.saved.torrents.forEach((torrentSummary) => {
            if (torrentSummary.status === 'paused') {
                torrentSummary.status = 'downloading'
                // this.startTorrentingSummary(torrentSummary.torrentKey)
                this.resumeTorrent(torrentSummary.infoHash)
            }
        })
    }

    pauseTorrent(torrentSummary, playSound) {
        if (torrentSummary.status == 'paused') return
        torrentSummary.status = 'paused'
        // console.log("pauseTorrent:%s, wt-stop-torrenting", torrentSummary.infoHash);
        // ipcRenderer.send('wt-stop-torrenting', torrentSummary.infoHash)
        console.log("pauseTorrent:%s, wt-pause-torrenting", torrentSummary.infoHash);
        ipcRenderer.send('wt-pause-torrenting', torrentSummary.infoHash)

    }

    resumeTorrent(torrentSummary) {
        if (torrentSummary.status != 'paused') return
        torrentSummary.status = 'downloading'
        // console.log("pauseTorrent:%s, wt-stop-torrenting", torrentSummary.infoHash);
        // ipcRenderer.send('wt-stop-torrenting', torrentSummary.infoHash)
        console.log("resumeTorrent:%s, wt-resume-torrenting", torrentSummary.infoHash);
        ipcRenderer.send('wt-resume-torrenting', torrentSummary.infoHash)
    }

    prioritizeTorrent(infoHash) {
        this.state.saved.torrents
            .filter((torrent) => { // We're interested in active torrents only.
                return (['downloading', 'seeding'].indexOf(torrent.status) !== -1)
                // return (['seeding'].indexOf(torrent.status) !== -1)
            })
            .map((torrent) => { // Pause all active torrents except the one that started playing.
                if (infoHash === torrent.infoHash) return

                // Pause torrent without playing sounds.
                this.state.saved.torrentsToResume.push(torrent.infoHash)
                this.pauseTorrent(torrent, false)
            })

        console.log('Playback Priority: paused torrents: ', this.state.saved.torrentsToResume)
    }

    resumePausedTorrents() {
        console.log('Playback Priority: resuming paused torrents')
        if (!this.state.saved.torrentsToResume || !this.state.saved.torrentsToResume.length) return
        this.state.saved.torrentsToResume.map((infoHash) => {
            this.toggleTorrent(infoHash)
        })

        // reset paused torrents
        this.state.saved.torrentsToResume = []
    }

    toggleTorrentFile(infoHash, index) {
        const torrentSummary = TorrentSummary.getByKey(this.state, infoHash)
        torrentSummary.selections[index] = !torrentSummary.selections[index]

        // Let the WebTorrent process know to start or stop fetching that file
        if (torrentSummary.status !== 'paused') {
            ipcRenderer.send('wt-select-files', infoHash, torrentSummary.selections)
        }
    }

    confirmDeleteTorrent(infoHash, deleteData) {
        this.state.modal = {
            id: 'remove-torrent-modal',
            infoHash,
            deleteData
        }
    }

    // TODO: use torrentKey, not infoHash
    deleteTorrent(infoHash, deleteData) {
        console.log("deleteTorrent:%s, wt-stop-torrenting", infoHash);
        ipcRenderer.send('wt-stop-torrenting', infoHash)

        const index = this.state.saved.torrents.findIndex((x) => x.infoHash === infoHash)

        if (index > -1) {
            const summary = this.state.saved.torrents[index]

            // remove torrent and poster file
            deleteFile(TorrentSummary.getTorrentPath(summary))
            deleteFile(TorrentSummary.getPosterPath(summary))

            // optionally delete the torrent data
            if (deleteData) moveItemToTrash(summary)

            // remove torrent from saved list
            this.state.saved.torrents.splice(index, 1)
            dispatch('stateSave')
        }

        // prevent user from going forward to a deleted torrent
        this.state.location.clearForward('player')
    }

    toggleSelectTorrent(infoHash) {
        if (this.state.selectedInfoHash === infoHash) {
            this.state.selectedInfoHash = null
        } else {
            this.state.selectedInfoHash = infoHash
        }
    }

    // Takes a torrentSummary or torrentKey
    // Shows a Save File dialog, then saves the .torrent file wherever the user requests
    saveTorrentFileAs(torrentKey) {
        const torrentSummary = TorrentSummary.getByKey(this.state, torrentKey)
        if (!torrentSummary) throw new Error('Missing torrentKey: ' + torrentKey)
        const downloadPath = this.state.saved.prefs.downloadPath
        const newFileName = path.parse(torrentSummary.name).name + '.torrent'
        const win = electron.remote.getCurrentWindow()
        const opts = {
            title: 'Save Torrent File',
            defaultPath: path.join(downloadPath, newFileName),
            filters: [
                { name: 'Torrent Files', extensions: ['torrent'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        }

        electron.remote.dialog.showSaveDialog(win, opts, function(savePath) {
            console.log('Saving torrent ' + torrentKey + ' to ' + savePath)
            if (!savePath) return // They clicked Cancel
            const torrentPath = TorrentSummary.getTorrentPath(torrentSummary)
            fs.readFile(torrentPath, function(err, torrentFile) {
                if (err) return dispatch('error', err)
                fs.writeFile(savePath, torrentFile, function(err) {
                    if (err) return dispatch('error', err)
                })
            })
        })
    }
}

function dispatch(event, ...args) {
    ipcRenderer.send(event, ...args)
}