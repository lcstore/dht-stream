var util = require('./../lib/utils')
var HtmlCasts = require('./../render/lib/html-casts')
var prettierBytes = require('prettier-bytes')
const ipcRenderer = require('./../render/ipc-renderer')
const events = require('./events')

var cdnEle = document.querySelector('meta[name="_cdn_host"]')
var $videoList = document.querySelectorAll('.feed-ul .video-inner')
Array.from($videoList).forEach(function(elem, eindex) {
    var $videoBox = elem.querySelector('.video-box')
    var $video = document.createElement('video')
    $videoBox.appendChild($video)
    var dataURL = elem.querySelector('a[src]').getAttribute('src')

    $video.style.display = 'none'
    events.addEvents($video, elem, dataURL)
    // if (eindex == 0) {
    //    events.addDevice($video)
    // }
    // ipcRenderer.on('wt-ready-' + infoHash, (err, torrentKey, info) => {
    //     ipcRenderer.send('dispatch', 'playFile', info.infoHash)
    // })
})