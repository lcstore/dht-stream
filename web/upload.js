var dragDrop = require('drag-drop')
var http = require('http')
var querystring = require('querystring')
var client = require('./../lib/client')
var util = require('./../lib/utils')
var throttle = require('throttleit')

var $uploadCount = document.querySelector('#upload-count')
var $uploadLog = document.querySelector('#upload-log')
var $shareTarget = document.querySelector('#video-share-target')
if ($uploadCount && $uploadLog && $shareTarget) {
    dragDrop('.video-share-box', processFiles)
    selectUpload('.video-upload', processFiles)
}
// https://btorrent.xyz/
// https://instant.io/
var torrentSet = {}

function processFiles(files) {
    var videoFiles;
    if (files) {
        videoFiles = Array.from(files).filter(function(file) {
            return /(mp4|rmvb|mkv|avi)$/gi.test(file.name)
        })
    }
    if (!videoFiles || videoFiles.length < 1) {
        $uploadLog.innerHTML = '欢迎上传'
        return
    }
    var opts = {
        createdBy: '狸猫资讯lezomao.com',
        maxPeers: 5
    }
    var name = videoFiles[0].name
    name = name.replace(/(\.[a-zA-Z34]{3,5})$/, ".lezomao.com$1")
    opts.name = '狸猫资讯.' + name
    // opts.name = videoFiles[0].name
    client.seedTo(videoFiles, opts, function(torrent, err) {
        if (err) {
            if (err.message && err.message.indexOf('duplicate torrent') > 0) {
                $uploadLog.innerHTML = '已上传过'
            }
            return
        }

        console.log('hash:' + torrent.infoHash + ',Client is seeding ' + torrent.magnetURI)
        console.log('instant:' + torrent.torrentFileBlobURL)
        // console.log('createdBy:'+ torrent.createdBy)
        if (torrentSet[torrent.infoHash]) {
            $uploadLog.innerHTML = '已上传过'
            return
        }
        torrent.on('warning', util.warning)
        // torrent.on('error', util.error)
        torrent.on('download', throttle(function(num) {
            util.info('download:' + torrent.name + ',speed:' + num)
        }, 250))
        torrent.on('upload', throttle(function(num) {
            util.info('upload:' + torrent.name + ',speed:' + num)
        }, 250))
        var opts = {
            announce: ['ws://tracker.btsync.cf:2710/announce'],
            maxPeers: 5
        }
        var params = {}
        params.link = 'magnet:?xt=urn:btih:' + torrent.infoHash.toLowerCase()
        params.title = videoFiles[0].name
        params.space = torrent.length
        // console.log('params:',params);
        postTorrent(params, function(resp) {
            console.log('post.response:', resp);
            if (!resp || !resp.data || resp.code != 200) {
                // torrent.destroy()
                $uploadLog.innerHTML = '上传失败'
                return
            } else {
                var sumCount = 0;
                if ($uploadCount.innerHTML && !isNaN($uploadCount.innerHTML)) {
                    sumCount = $uploadCount.innerHTML.trim() - 0
                }
                sumCount = sumCount + torrent.files.length
                $uploadCount.innerHTML = '' + sumCount
                $uploadLog.innerHTML = '上传成功'
                $shareTarget.innerHTML = '<a href="/movie/torrent/' + resp.data.id + '.html" target="_blank">' + params.title + '</a>'
                torrentSet[torrent.infoHash] = 1
                // torrent.destroy()
            }

        })
    })
}

function postTorrent(params, cb) {
    var sContent = JSON.stringify(params)
    var options = {
        path: '/api/movie/upload.json',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': sContent.length
        }
    };
    // 处理响应的回调函数  
    var callback = function(response) {
        var body = '';
        response.on('data', function(data) {
            body += data;
        });
        response.on('end', function() {
            cb(JSON.parse(body));
        });
    }
    var req = http.request(options, callback);
    req.write(sContent);
    req.end();
}

function selectUpload(selector, processFiles) {
    var $browse = document.querySelector(selector)
    var fileDialog = document.createElement("INPUT");
    fileDialog.setAttribute("type", "file");
    // fileDialog.setAttribute("multiple", "true");
    fileDialog.type = "file";
    fileDialog.accept = "video/*";
    // .mkv 全下载完了才能播放
    fileDialog.accept = "video/*,.mkv,.flv";
    fileDialog.style.display = "none";
    $browse.addEventListener("click", function() {
        fileDialog.click();
    });
    fileDialog.addEventListener("change", function() {
        processFiles(fileDialog.files);
    })
}