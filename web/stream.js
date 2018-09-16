var moment = require('moment')
var util = require('./../lib/utils')
var prettierBytes = require('prettier-bytes')
const ipcRenderer = require('./../render/ipc-renderer')
const events = require('./events')

var $postVideo = document.querySelector('#post-video')
if ($postVideo) {
    $postVideo.addEventListener("click", function() {
        var cdnEle = document.querySelector('meta[name="_cdn_host"]')
        var $link = document.querySelector('#link')
        var $videoList = document.querySelectorAll('#post-video')
        Array.from($videoList).reverse().forEach(function(elem, eindex) {
            var $videoBox = elem.querySelector('.video')
            var $video = document.createElement('video')
            $videoBox.appendChild($video)
            var dataURL = $link.value.trim();


            // util.info('magnetURI:' + magnetURI + ',infoHash:' + infoHash)
            $video.style.display = 'none'
            $video.setAttribute('autoplay', true)
            addEvents($video, document, dataURL)
            // $video.play()
            events.addDevice($video)
            
            var infoHash = $video.getAttribute('data-infohash')
            if (infoHash) {
                ipcRenderer.on('wt-ready-' + infoHash, (err, torrentKey, info) => {
                    ipcRenderer.send('dispatch', 'playFile', info.infoHash)
                })
            }
        })
    });
}

function addEvents($video, $elem, infoHash) {
    var $play = $elem.querySelector('#post-video')
    var $videoCover = $elem.querySelector('.video-cover-detail');


    var $progressBar = document.querySelector('.progressBar')
    var $numPeers = document.querySelector('#numPeers')
    var $downloaded = document.querySelector('#downloaded')
    var $total = document.querySelector('#total')
    var $remaining = document.querySelector('#remaining')
    // var $uploadSpeed = document.querySelector('#uploadSpeed')
    var $downloadSpeed = document.querySelector('#downloadSpeed')

    // var $loading = document.querySelector('#loading')


    $play.addEventListener("click", function() {
        $video.play()
        if ($video.readyState < 3) {
            ipcRenderer.send('dispatch', 'prioritizeTorrent', infoHash)
        }
    });

    $video.addEventListener("pause", () => {
        console.log("pause..........");
    })

    $video.addEventListener("play", () => {
        $videoCover.style.display = 'none'
        $video.style.display = 'block'
        var pevent = document.createEvent('HTMLEvents');
        // 事件类型，是否冒泡，是否阻止浏览器的默认行为  
        pevent.initEvent("progress", false, false);
        pevent.eventType = 'message';
        $video.dispatchEvent(pevent);


    })
    // $video.addEventListener("loadeddata", () => {
    //     console.log("onloadeddata..........");
    // })
    // $video.addEventListener("loadedmetadata", () => {
    //     console.log("onloadedmetadata..........");
    // })
    // $video.addEventListener("loadstart", () => {
    //     console.log("onloadstart..........");
    // })
    $video.addEventListener("ended", () => {
        $videoCover.style.display = 'block'
        // $video.style.display = 'none'
    })
    $video.addEventListener("progress", () => {
        // 0 = HAVE_NOTHING - 没有关于音频/视频是否就绪的信息
        // 1 = HAVE_METADATA - 关于音频/视频就绪的元数据
        // 2 = HAVE_CURRENT_DATA - 关于当前播放位置的数据是可用的，但没有足够的数据来播放下一帧/毫秒
        // 3 = HAVE_FUTURE_DATA - 当前及至少下一帧的数据是可用的
        // 4 = HAVE_ENOUGH_DATA - 可用数据足以开始播放
        if (!$video.paused) {
            if ($video.readyState === 0) {
                // $loading.style.display = 'block'
                $video.style.display = 'none'
            } else {
                // $loading.style.display = 'none'
                $video.style.display = 'block'

            }
        }
    })
    $video.addEventListener("canplaythrough", () => {
        // console.log("canplaythrough..........");
    })

    ipcRenderer.on('wt-progress', (err, progress) => {
        const torrentKey = $video.getAttribute('torrentkey')
        if (!progress || !progress.torrents || torrentKey == undefined || torrentKey == null) {
            return
        }
        const tprocess = progress.torrents.find((tprocess) => {
            return tprocess.torrentKey == torrentKey
        })
        if (tprocess) {
            var percent = Math.round(tprocess.downloaded / tprocess.length * 100 * 100) / 100
            $progressBar.style.width = percent + '%'
            $downloaded.innerHTML = prettierBytes(tprocess.downloaded)
            $total.innerHTML = prettierBytes(tprocess.length)

            // Remaining time
            var remaining
            if (tprocess.progress == 1) {
                remaining = '已完成'
                $downloadSpeed.innerHTML = '-'
            } else {
                if (tprocess.downloadSpeed != 0 && tprocess.length > 0) {
                    var timeRemaining = (tprocess.length - tprocess.downloaded) / tprocess.downloadSpeed
                    remaining = moment.duration(timeRemaining, 'seconds').as('minutes')
                    remaining = remaining.toFixed(2) + "分"
                } else {
                    remaining = '省余时间'
                }
                $downloadSpeed.innerHTML = prettierBytes(tprocess.downloadSpeed) + '/S'
            }
            $remaining.innerHTML = remaining

            if (percent >= 10 && !$video.paused && $video.readyState == 1) {
                $video.readyState = 3
                $video.pause()
                $video.play()
            }
        }
    })
}