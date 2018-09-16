document.addEventListener('DOMContentLoaded', function() {
    const main = require('./render/main')
    const ipcRenderer = require('./render/ipc-renderer')
    ipcRenderer.on('ipcReady', () => {
        var feeds = require('./web/feeds')
        var stream = require('./web/stream')
        var upload = require('./web/upload')
        var cms = require('./web/cms')
    })
}, false)
// var fs = require('fs')
// const path = require('path')
// const parseTorrent = require('parse-torrent')
// const torrent = fs.readFileSync(path.join('/Users/baidu/Downloads/', 'cosmosLaundromat.torrent'))
// const parsedTorrent = parseTorrent(torrent)
// console.log("infoHash:" + JSON.stringify(parsedTorrent.infoHash));
// console.log("files:" + JSON.stringify(parsedTorrent.files));