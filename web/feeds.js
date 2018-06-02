var client = require('./../lib/client')
var util = require('./../lib/utils')
var prettierBytes = require('prettier-bytes')



var $videoList = document.querySelectorAll('.video-inner')
Array.from($videoList).forEach(onPrepareTorrent)
var options = {
    announce: ['ws://tracker.btsync.cf:2710/announce'],
    maxPeers: 5
}

function onPrepareTorrent(elem) {
    if (!elem) {
        return false
    }

    var $videoBox = elem.querySelector('.video-box')
    var $play = elem.querySelector('.video-play')
    var $videoCover = elem.querySelector('.video-cover');
    var $loading = elem.querySelector('.loading')
    if (!$videoBox || !$play) {
    	return false
    }

    var $video = document.createElement('video')
    $videoBox.appendChild($video)
    $play.addEventListener("click", function() {
        $videoCover.style.display = 'none'
        if ($video.readyState > 0) {
            if ($video.paused) {
                $video.autoplay = true
                $video.muted = false
                $video.controls = true
                $video.play()
            }
            $loading.style.display = 'none'
        } else {
            $loading.style.display = 'block'
        }

    });
    $video.addEventListener("loadedmetadata", function() {
        if ($loading.style.display == 'block') {
            if ($video.paused) {
                $video.autoplay = true
                $video.muted = false
                $video.controls = true
                $video.play()
            }
            $loading.style.display = 'none'
        }
    });

    // var magnetURI = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F'
    var magnetURI = elem.querySelector('a[src]').getAttribute('src')
    if (!(/^magnet:/i.test(magnetURI))) {
        magnetURI = 'magnet:?xt=urn:btih:' + magnetURI
    }
    magnetURI = magnetURI + '&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=ws%3A%2F%2Ftracker.btsync.cf%3A2710%2Fannounce&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
    util.info('magnetURI:' + magnetURI)
    client.extractTo(magnetURI, options, function(torrent, error) {
        onTorrentAppendTo(torrent, error, elem)
    })
}

function getElem(tagName, opts) {
    if (tagName === 'video' || tagName === 'audio') {
        return createMedia(tagName, opts)
    } else {
        return createElem(tagName)
    }

    function createMedia(tagName, opts) {
        var elem = createElem(tagName)
        if (opts.autoplay) elem.autoplay = true
        if (opts.muted) elem.muted = true
        if (opts.controls) elem.controls = true
        return elem
    }

    function createElem(tagName) {
        var elem = document.createElement(tagName)
        return elem
    }
}

function onTorrentAppendTo(torrent, error, elem) {
    if (error || !elem) {
        return
    }
    var acceptFiles = torrent.files.filter(function(file) {
        var bAccept = /(mp4|rmvb|mkv|avi)$/gi.test(file.name)
        if (!bAccept) {
            file.deselect()
        }
        return bAccept
    })
    var opts = {
        autoplay: true,
        muted: false // 不减音量
    }
    acceptFiles.sort(function(lfile, rfile) {
        return rfile.name - lfile.name
    })

    var acceptFile = acceptFiles[0]
    util.info('acceptFile:' + acceptFile.name)
    var $downloaded = elem.querySelector('.downloaded')
    var $total = elem.querySelector('.total')
    var $progressBar = elem.querySelector('.progressBar')
    var $loading = elem.querySelector('.loading')
    var $video = elem.querySelector('video');

    var opts = {
        autoplay: false,
        muted: false, // 不减音量
        maxBlobLength: 2 * 1000 * 1000 * 1000 // 2 GB, default 200M
    }
    acceptFile.renderTo($video, opts, function(err, ele) {
        if (err) return util.error(err)
        // play event. video element: ele
        util.info('critical.acceptFile:' + acceptFile._startPiece + ',' + acceptFile._endPiece)
        torrent.critical(acceptFile._startPiece, acceptFile._endPiece)
    })

    torrent.on('done', onDone)
    var progressTrigger = setInterval(onProgress, 500)
    onProgress()

    // Statistics
    function onProgress() {
        // Progress
        var percent = Math.round(torrent.progress * 100 * 100) / 100
        $progressBar.style.width = percent + '%'
        $downloaded.innerHTML = prettierBytes(torrent.downloaded)
        $total.innerHTML = prettierBytes(torrent.length)
    }

    function onDone() {
        onProgress()
        clearInterval(progressTrigger)
    }

}