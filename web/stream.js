var moment = require('moment')
var client = require('./../lib/client')
var util = require('./../lib/utils')
var prettierBytes = require('prettier-bytes')
// HTML elements
var $body = document.querySelector('#post-video')
var $progressBar = document.querySelector('.progressBar')
var $numPeers = document.querySelector('#numPeers')
var $downloaded = document.querySelector('#downloaded')
var $total = document.querySelector('#total')
var $remaining = document.querySelector('#remaining')
// var $uploadSpeed = document.querySelector('#uploadSpeed')
var $downloadSpeed = document.querySelector('#downloadSpeed')
var $link = document.querySelector('#link')
var $loading = document.querySelector('#loading')


registerADD('#post-video')

function registerADD(selector) {
    var $browse = document.querySelector(selector)
    if (!$browse) {
        return
    }
    $browse.addEventListener("click", function() {
        // var magnetURI = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F'
        var magnetURI = $link.value.trim();
        if (!(/^magnet:/i.test(magnetURI))) {
            magnetURI = 'magnet:?xt=urn:btih:' + magnetURI
        }
        magnetURI = magnetURI + '&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=ws%3A%2F%2Ftracker.btsync.cf%3A2710%2Fannounce&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
        console.log('magnetURI:', magnetURI)
        var opts = {
            announce: ['ws://tracker.btsync.cf:2710/announce'],
            maxPeers: 5
        }
        client.extractTo(magnetURI, opts, onADDTorrent)
    });
}

function onADDTorrent(torrent, error) {
    if (error) {
        $loading.style = 'display: none;'
        return
    }
    // Got torrent metadata!
    console.log('Client is downloading:', torrent.infoHash)
    // Torrents can contain many files. Let's use the .mp4 file
    var acceptFiles = torrent.files.filter(function(file) {
        var bAccept = /(mp4|rmvb|mkv|avi)$/gi.test(file.name)
        if (!bAccept) {
            file.deselect()
        }
        return bAccept
    })
    var opts = {
        autoplay: true,
        controls: true,
        muted: false, // 不减音量
        maxBlobLength: 2 * 1000 * 1000 * 1000 // 2 GB, default=200M
    }
    acceptFiles.sort(function(lfile, rfile) {
        return rfile.name - lfile.name
    })
    var acceptFile = acceptFiles[0]
    console.log('Client is files:', acceptFile.name)
    acceptFile.appendTo('#post-video .video', opts, function(err, elem) {
        if (err) return util.error(err)
        // elem.parentElement.classList.add('canplay')
        // elem.parentElement.classList.add('muted')
        // elem.muted = false
    })
    torrent.on('done', onDone)
    var progressTrigger = setInterval(onProgress, 500)
    onProgress()

    // Statistics
    function onProgress() {
        // Peers
        // $numPeers.innerHTML = torrent.numPeers + (torrent.numPeers === 1 ? ' peer' : ' peers')
        if (torrent.downloaded > 0) {
            $loading.style.display = 'none'
        }
        // Progress
        var percent = Math.round(torrent.progress * 100 * 100) / 100
        $progressBar.style.width = percent + '%'
        $downloaded.innerHTML = prettierBytes(torrent.downloaded)
        $total.innerHTML = prettierBytes(torrent.length)

        // Remaining time
        var remaining
        if (torrent.done) {
            remaining = '已完成'
            $downloadSpeed.innerHTML = '-'
        } else {
            remaining = moment.duration(torrent.timeRemaining / 1000, 'seconds').as('minutes')
            if ('Infinity' != remaining && !isNaN(remaining)) {
                remaining = remaining.toFixed(2) + "分"
            } else {
                remaining = '省余时间'
            }
            $downloadSpeed.innerHTML = prettierBytes(torrent.downloadSpeed) + '/S'
        }
        $remaining.innerHTML = remaining
    }

    function onDone() {
        onProgress()
        clearInterval(progressTrigger)
    }

}