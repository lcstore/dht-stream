var prettierBytes = require('prettier-bytes')
var Hls = require('hls.js')
const ipcRenderer = require('./../render/ipc-renderer')
const HtmlCasts = require('./../render/lib/html-casts')

const Events = module.exports = {
    addEvents,
    addDevice
}

function addDevice($video) {
    var cdnEle = document.querySelector('meta[name="_cdn_host"]')
    var cdnURL = cdnEle.getAttribute('content')
    cdnURL = encodeURIComponent(cdnURL)
    var infoHash = $video.getAttribute('data-infohash')
    if (infoHash) {
        // cdnURL = 'http://www.lezomao.com'
        var magnetURI = 'magnet:?xt=urn:btih:' + infoHash
        magnetURI = magnetURI.indexOf('?') > 0 ? magnetURI : magnetURI + '?'
        // magnetURI = magnetURI + '&ws=' + cdnURL + '/piece/' + infoHash + '.mp4?t=1'
        magnetURI = magnetURI + '&xs=' + cdnURL + '/meta/' + infoHash + '.torrent'
        HtmlCasts.addDevice($video, magnetURI)
    } else {
        var dataURL = $video.getAttribute('data-url')
        if ($video.canPlayType('application/vnd.apple.mpegurl')) {
            $video.src = dataURL;
            $video.addEventListener('loadedmetadata', function() {
                $video.play();
            });
        } else if (Hls.isSupported()) {
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(dataURL);
                hls.attachMedia($video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    // video.play();
                });
            }
        }
    }
}

function addEvents($video, $elem, dataURL) {
    var $play = $elem.querySelector('.video-play')
    var $videoCover = $elem.querySelector('.video-cover');
    // use default loading
    // var $loading = $elem.querySelector('.loading')
    var $downloaded = $elem.querySelector('.downloaded')
    var $total = $elem.querySelector('.total')
    var $progressBar = $elem.querySelector('.progressBar')

    $video.setAttribute('data-url', dataURL)
    if (/magnet:\?xt=urn:btih:([0-9a-zA-Z]{20,})/i.test(dataURL)) {
        var infoHash = RegExp.$1
        $video.setAttribute('data-infohash', infoHash)
    }

    $play.addEventListener("click", function() {
        if ($video.readyState < 3) {
            if ($video.readyState == 0 && $video.getAttribute('controls') == undefined) {
                addDevice($video)
            }
            var infoHash = $video.getAttribute('data-infohash')
            if (infoHash) {
                ipcRenderer.send('dispatch', 'prioritizeTorrent', infoHash)
            }
        }
        $video.play()

    });


    $video.addEventListener("play", () => {
        $videoCover.style.display = 'none'
        $video.style.display = 'block'
        var pevent = document.createEvent('HTMLEvents');
        // 事件类型，是否冒泡，是否阻止浏览器的默认行为  
        pevent.initEvent("progress", false, false);
        pevent.eventType = 'message';
        $video.dispatchEvent(pevent);

    })

    $video.addEventListener("ended", () => {
        $videoCover.style.display = 'block'
        $video.style.display = 'none'
    })
    $video.addEventListener("progress", () => {
        // 0 = HAVE_NOTHING - 没有关于音频/视频是否就绪的信息
        // 1 = HAVE_METADATA - 关于音频/视频就绪的元数据
        // 2 = HAVE_CURRENT_DATA - 关于当前播放位置的数据是可用的，但没有足够的数据来播放下一帧/毫秒
        // 3 = HAVE_FUTURE_DATA - 当前及至少下一帧的数据是可用的
        // 4 = HAVE_ENOUGH_DATA - 可用数据足以开始播放
        // use default loading
        // if (!$video.paused) {
        //     if ($video.readyState === 0) {
        //         $loading.style.display = 'block'
        //     } else {
        //         $loading.style.display = 'none'
        //     }
        // }
    })
    // $video.addEventListener("pause", () => {
    //     console.log("pause..........");
    // })
    // $video.addEventListener("loadeddata", () => {
    //     console.log("onloadeddata..........");
    // })
    // $video.addEventListener("loadedmetadata", () => {
    //     console.log("onloadedmetadata..........");
    // })
    // $video.addEventListener("loadstart", () => {
    //     console.log("onloadstart..........");
    // })
    // $video.addEventListener("canplay", () => {
    //     console.log("canplay..........");
    // })
    // $video.addEventListener("canplaythrough", () => {
    //     console.log("canplaythrough..........");
    // })

    var infoHash = $video.getAttribute('data-infohash')
    if (infoHash) {
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

                // console.error("progress:" + torrentKey + ",.......$video.readyState:" + $video.readyState);
                // 解决先播放，元信息后加载，下载完也不播放的问题
                if (percent >= 10 && !$video.paused && $video.readyState == 1) {
                    $video.readyState = 3
                    $video.pause()
                    $video.play()
                }
            }
        })

    }

}