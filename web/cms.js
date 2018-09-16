const captureFrame = require('capture-frame')

var util = require('./../lib/utils')
var HtmlCasts = require('./../render/lib/html-casts')
var prettierBytes = require('prettier-bytes')
const ipcRenderer = require('./../render/ipc-renderer')
const events = require('./events')


var $videoList = document.querySelectorAll('.editor-ul .video-inner')
Array.from($videoList).reverse().forEach(function(elem, eindex) {
    var $videoBox = elem.querySelector('.video-box-cms')
    var $video = document.createElement('video')
    $videoBox.appendChild($video)
    var magnetURI = elem.querySelector('a[src]').getAttribute('src')
    var infoHash = magnetURI
    if (/magnet:\?xt=urn:btih:([0-9a-zA-Z]{20,})/i.test(magnetURI)) {
        infoHash = RegExp.$1
    }
    // util.info('magnetURI:' + magnetURI + ',infoHash:' + infoHash)
    $video.style.display = 'none'
    $video.setAttribute('data-infohash', infoHash)
    events.addEvents($video, elem, infoHash)

    // ipcRenderer.on('wt-ready-' + infoHash, (err, torrentKey, info) => {
    //     ipcRenderer.send('dispatch', 'playFile', info.infoHash)
    // })
})

if ($videoList.length > 0) {
    document.body.addEventListener("keydown", function(event) {
        if (event.ctrlKey == true && event.shiftKey == true && event.keyCode == 13) {
            // ctr + shift + enter, save capture image
            var $videoBox = document.querySelector('.video-box-cms[captured="upload"]')
            if ($videoBox) {
                var $previewImgEle = $videoBox.querySelector('.video-cover .file-input .file-default-preview img.video-img[src^="data:"]')

                var base64URL = $previewImgEle.getAttribute('src')
                var sMark = 'base64,'
                var index = base64URL.indexOf(sMark);
                var base64Val = base64URL.substring(index + sMark.length)
                var buf = new Buffer(base64Val, 'base64')
                var blob = toBlob(buf)
                var $inputImg = $videoBox.querySelector('[id^=input-img]')

                var evt = document.createEvent("CustomEvent");
                evt.initCustomEvent("doupload", false, false, { imgblob: blob });
                $inputImg.dispatchEvent(evt);

            }
        } else if (event.ctrlKey == true && event.keyCode == 13) {
            // ctr + enter, capture screen
            var $videoAlls = document.querySelectorAll('.editor-ul .video-inner video[src][torrentkey]')
            Array.from($videoAlls).forEach(($video, index) => {
                if (!$video.paused) {
                    $video.pause()
                    var $elem = $video.parentNode
                    var $videoCover = $elem.querySelector('.video-cover');
                    var $previewImgEle = $elem.querySelector('.video-cover .file-input .file-default-preview img.video-img')

                    var buf = captureFrame($video, "jpeg")
                    const image = document.createElement('img')
                    var base64URL = 'data:image/jpeg;base64,' + buf.toString("base64")
                    $previewImgEle.setAttribute('src', base64URL)
                    $videoCover.style.display = 'block'
                    $video.style.display = 'none'
                    $elem.setAttribute('captured', 'upload')
                    return false
                }
            })
        }

    });
}

function toBlob(buf) {
    var u8arr = toArrayBuffer(buf)
    return new Blob([u8arr], { type: 'image/jpeg' });
}

function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}