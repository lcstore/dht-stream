const parallelLimit = require('run-parallel-limit')
const zlib = require('zlib');
const dragDrop = require('drag-drop')
const parseTorrent = require('parse-torrent')
var http = require('http')
var utils = require('util')
var querystring = require('querystring')
var Client = require('./../lib/client')
var util = require('./../lib/utils')
var throttle = require('throttleit')
var debug = require('debug')('dhtstream:upload')
var retry = require('retry');

var client = null
var $uploadCount = document.querySelector('#upload-count')
var $uploadLog = document.querySelector('#upload-log')
var $shareTarget = document.querySelector('#video-share-target')
if ($uploadCount && $uploadLog && $shareTarget) {
    Client.getClient(function(err, newClient) {
        if (err) return util.error(err)
        client = newClient
        dragDrop('.video-share-box', processFiles)
        selectUpload('.video-upload', processFiles)
    })

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
    client.seed(videoFiles, opts, function(torrent, err) {
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

        var torrentFile = makeTorrentFile(torrent)

        var sTorrentFile = torrentFile.toString("base64")
        var infoHash = torrent.infoHash.toLowerCase()
        var params = {}
        params.link = 'magnet:?xt=urn:btih:' + infoHash
        params.title = videoFiles[0].name
        params.space = torrent.length
        params.infoHash = infoHash
        params.torrentFile = sTorrentFile

        var total = torrent.pieces.length
        var uCount = 0
        parallelLimit(torrent.pieces.map(function(piece, index) {
            return function(pcb) {
                torrent.store.get(index, function(err, buf) {
                    if (err || !buf) {
                        console.error(utils.format('UploadPieceErr.torrent=%s,pieceIndex=%d,pieceHash=%s,cause:', params.infoHash, index, pieceHash), err)
                        return pcb(err)
                    }
                    var rangeStart = index * torrent.pieceLength
                    var pieceHash = torrent._hashes[index]
                    // upload piece's buffer
                    var pieceParams = {}
                    pieceParams.infoHash = params.infoHash
                    pieceParams.start = rangeStart
                    zlib.gzip(buf, function(zerror, zbuf) { // The callback will give you the 
                        var bLarger = zbuf.length > buf.length
                        if (bLarger) {
                            pieceParams.data = buf.toString("base64")
                        } else {
                            pieceParams.data = zbuf.toString("base64")
                        }
                        debug('UploadPiece.torrent=%s,pieceIndex=%d,pieceHash=%s,rangeStart=%d,buf=%d,zbuf=%d,base64=%d,larger=%s',
                            params.infoHash, index, pieceHash, rangeStart, buf.length, zbuf.length, pieceParams.data.length, bLarger)
                        retryPostPiece(pieceParams, (error, ret) => {
                            if (error) {
                                console.error('postPiece.params:' + JSON.stringify(pieceParams) + ',ret:' + JSON.stringify(ret) + ",error:", error);
                                return
                            }
                            uCount++
                            var percent = uCount * 100 / total;
                            percent = parseInt(percent)
                            $uploadLog.innerHTML = percent + '%'
                            pcb(error, ret)
                        })
                    });

                })
            }
        }), 2, function(err) {
            if (err) {
                console.error("upload.torrent,cause:", err);
                return false
            }
            console.info(utils.format('UploadPiece.torrent=%s,pieceCount=%d', params.infoHash, torrent.pieces.length))
            postTorrent(params, function(error, resp) {
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


    })
}

function makeTorrentFile(torrent) {
    var parsedTorrent = parseTorrent(torrent.torrentFile)
    if (parsedTorrent.announce) {
        parsedTorrent.announce = parsedTorrent.announce.filter(function(url) {
            if (url.indexOf('localhost') > 0 || url.indexOf('lezomao.com') > 0) return false
            return url.indexOf('wss://') === 0 || url.indexOf('ws://') === 0
        })
    }

    if (parsedTorrent.urlList) {
        parsedTorrent.urlList = parsedTorrent.urlList.filter(function(url) {
            if (url.indexOf('localhost') > 0 || url.indexOf('lezomao.com') > 0) return false
        })
    }
    return parseTorrent.toTorrentFile(parsedTorrent)
}

function postTorrent(params, cb) {
    var sContent = JSON.stringify(params)
    var options = {
        path: '/api/movie/vmeta.post',
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
            cb(null, JSON.parse(body));
        });
        response.on('error', function(error) {
            cb(error);
        });
    }
    var req = http.request(options, callback);
    req.write(sContent);
    req.end();
}

function retryPostPiece(params, cb) {
    var operation = retry.operation({
        retries: 5,
        factor: 3,
        minTimeout: 1 * 1000,
        maxTimeout: 60 * 1000,
        randomize: true,
    });
    operation.attempt(function(currentAttempt) {
        postPiece(params, function(err, body) {
            if (operation.retry(err)) {
                return;
            }
            cb(err ? operation.mainError() : null, body);
        });
    });
}

function postPiece(params, cb) {
    var sContent = JSON.stringify(params)
    var options = {
        path: '/api/movie/piece.post',
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
            cb(null, JSON.parse(body));
        });
        response.on('error', function(error) {
            cb(error);
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