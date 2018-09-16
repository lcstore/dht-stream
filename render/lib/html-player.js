const ipcRenderer = require('./../ipc-renderer')
const TorrentSummary = require('./torrent-summary')
const TorrentPlayer = require('./torrent-player')

const options = {
    controls: true,
    autoplay: false,
    muted: false, // 不减音量
    maxBlobLength: 2 * 1000 * 1000 * 1000 // 2 GB, default 200M
}
module.exports = class HtmlPlayer {
    constructor(elem, torrentID) {
        var self = this
        self.element = elem
        if (torrentID && /magnet:\?xt=urn:btih:([0-9a-zA-Z]{20,})/i.test(torrentID)) {
            self.infoHash = RegExp.$1
        } else {
            self.infoHash = torrentID
        }
        self.element.setAttribute('controls', true)
        const tOptions = {}
        const cdnEle = document.querySelector('meta[name="_cdn_host"]')
        if (cdnEle) {
            const cdnURL = cdnEle.getAttribute('content')
            if (cdnURL) {
                const seedURL = cdnURL + '/piece/' + self.infoHash + '.raw'
                const xsURL = cdnURL + '/meta/' + self.infoHash + '.torrent'
                const seedURLs = []
                seedURLs.push(seedURL)
                tOptions.urlList = seedURLs
                // tOptions.xs = xsURL
            }
        }
        ipcRenderer.send('dispatch', 'addTorrent', torrentID, tOptions)
        ipcRenderer.on('wt-ready-' + self.infoHash, (err, torrentKey, info) => {
            // ipcRenderer.send('dispatch', 'playFile', info.infoHash)
            // console.error("ready to render:" + JSON.stringify(info));
            self.element.setAttribute('torrentkey', torrentKey)
            var index = self.element.getAttribute('select-file')
            index = index == null ? undefined : index
            if (index === undefined && info && info.files) {
                index = info.files.findIndex(TorrentPlayer.isPlayable)
                self.selectFile(index)
            }
            if (index === undefined) {
                dispatch('error', new UnplayableTorrentError(torrentId))
                return
            }
            options.autoplay = !self.element.paused
            ipcRenderer.send('wt-render-to', info.infoHash, index, self.element, options, (err, randerTo) => {
                console.info("randerTo:" + randerTo);
            })
        })
    }

    match(infoHash) {
        return this.infoHash === infoHash
    }

    selectFile(fileIndex) {
        this.element.setAttribute('select-file', fileIndex)
    }

    torrentKey(key) {
        this.torrentKey = key
        // use to handle progress
        this.element.setAttribute('torrentkey', key)
    }

    play(url, opt, cb) {
        this.element.play()
        cb()
    }

    pause(cb) {
        this.element.pause()
        cb()
    }

    stop(cb) {
        return this.pause(cb)
    }

    status() {
        return this.element.readyState
    }

    seek(time, cb) {
        cb(null)
    }

    volume(volume, cb) {
        this.element.volume = volume
        cb(null, this.element.volume)
    }

    rate(rate, cb) {
        this.element.playbackRate = rate
        cb(null, this.element.playbackRate)
    }
}