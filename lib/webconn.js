// replace webtorrent webconn.js
module.exports = WebConn

var Buffer = require('safe-buffer').Buffer
var debug = require('debug')('webtorrent:webconn')
var get = require('simple-get')
var VERSION = require('../package.json').version
var zlib = require('zlib');

function WebConn(url, torrent) {
    this.url = url
    this._torrent = torrent
}

WebConn.prototype.httpRequest = function(pieceIndex, offset, length, cb) {
    var self = this
    var pieceOffset = pieceIndex * self._torrent.pieceLength
    var rangeStart = pieceOffset + offset /* offset within whole torrent */
    var rangeEnd = rangeStart + length - 1

    // Web seed URL format:
    // For single-file torrents, make HTTP range requests directly to the web seed URL
    // For multi-file torrents, add the torrent folder and file name to the URL
    var files = self._torrent.files
    var requests
    if (files.length <= 1) {
        requests = [{
            url: self.url,
            start: rangeStart,
            end: rangeEnd
        }]
    } else {
        var requestedFiles = files.filter(function(file) {
            return file.offset <= rangeEnd && (file.offset + file.length) > rangeStart
        })
        if (requestedFiles.length < 1) {
            return cb(new Error('Could not find file corresponnding to web seed range request'))
        }

        requests = requestedFiles.map(function(requestedFile) {
            var fileEnd = requestedFile.offset + requestedFile.length - 1
            var url = self.url +
                (self.url[self.url.length - 1] === '/' ? '' : '/') +
                requestedFile.path
            return {
                url: url,
                fileOffsetInRange: Math.max(requestedFile.offset - rangeStart, 0),
                start: Math.max(rangeStart - requestedFile.offset, 0),
                end: Math.min(fileEnd, rangeEnd - requestedFile.offset)
            }
        })
    }

    // Now make all the HTTP requests we need in order to load this piece
    // Usually that's one requests, but sometimes it will be multiple
    // Send requests in parallel and wait for them all to come back
    var numRequestsSucceeded = 0
    var hasError = false

    var ret
    if (requests.length > 1) {
        ret = Buffer.alloc(length)
    }

    requests.forEach(function(request) {
        var url = request.url
        var start = request.start
        var end = request.end
        if (url.indexOf('?') < 0) url = url + "?"
        if (url.indexOf('&') > 0) url = url + "&"
        url = url + "start=" + start + "&index=" + pieceIndex

        debug(
            'Requesting url=%s pieceIndex=%d offset=%d length=%d start=%d end=%d',
            url, pieceIndex, offset, length, start, end
        )
        var opts = {
            url: url,
            method: 'GET',
            headers: {
                'user-agent': 'dhstream/' + VERSION + ' (https://lezomao.com)'
                // range: 'bytes=' + start + '-' + end
            }
        }
        delete opts.headers.range

        function onResponse(res, data) {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                hasError = true
                return cb(new Error('Unexpected HTTP status code ' + res.statusCode))
            }
            data = data.toString().trim()
            var buf = new Buffer(data, "base64");
            debug('Got data of length %d,buffer %d', data.length, buf.length)
            function doReturn(buf) {
                if (requests.length === 1) {
                    // Common case: fetch piece in a single HTTP request, return directly
                    cb(null, buf)
                } else {
                    // Rare case: reconstruct multiple HTTP requests across 2+ files into one
                    // piece buffer
                    buf.copy(ret, request.fileOffsetInRange)
                    if (++numRequestsSucceeded === requests.length) {
                        cb(null, ret)
                    }
                }
            }
            if (isGzipBuffer(buf)) {
                zlib.gunzip(buf, (uzerror, uzbuf) => {
                    doReturn(uzbuf)
                })
            } else {
                doReturn(buf)
            }

        }
        get.concat(opts, function(err, res, data) {
            if (hasError) return
            if (err) {
                // Browsers allow HTTP redirects for simple cross-origin
                // requests but not for requests that require preflight.
                // Use a simple request to unravel any redirects and get the
                // final URL.  Retry the original request with the new URL if
                // it's different.
                //
                // This test is imperfect but it's simple and good for common
                // cases.  It catches all cross-origin cases but matches a few
                // same-origin cases too.
                if (typeof window === 'undefined' || url.startsWith(window.location.origin + '/')) {
                    hasError = true
                    return cb(err)
                }

                return get.head(url, function(errHead, res) {
                    if (hasError) return
                    if (errHead) {
                        hasError = true
                        return cb(errHead)
                    }
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        hasError = true
                        return cb(new Error('Unexpected HTTP status code ' + res.statusCode))
                    }
                    if (res.url === url) {
                        hasError = true
                        return cb(err)
                    }

                    opts.url = res.url
                    get.concat(opts, function(err, res, data) {
                        if (hasError) return
                        if (err) {
                            hasError = true
                            return cb(err)
                        }
                        onResponse(res, data)
                    })
                })
            }
            onResponse(res, data)
        })
    })
}

function isGzipBuffer(buf) {
    if (!buf || buf.length < 3) {
        return false;
    }
    return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
}