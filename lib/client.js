// .mkv 全下载完了才能播放
var WebTorrent = require('webtorrent-hybrid')
// var WebTorrent = require('webtorrent')
var createTorrent = require('create-torrent')
var thunky = require('thunky')
var get = require('simple-get')
var util = require('./utils')

var DISALLOWED = [
    '6feb54706f41f459f819c0ae5b560a21ebfead8f'
]
global.WEBTORRENT_ANNOUNCE = createTorrent.announceList
    .map(function(arr) {
        return arr[0]
    })
    .filter(function(url) {
        return url.indexOf('wss://') === 0 || url.indexOf('ws://') === 0
    })
// global.WEBTORRENT_ANNOUNCE.push('wss://lezomao.com/wss')
// 延迟执行并缓存结果
var getClient = thunky(function(cb) {
    getRtcConfig(function(err, rtcConfig) {
        if (err) util.error(err)
        console.info("useConfig:" + JSON.stringify(rtcConfig));
        var client = new WebTorrent({
            maxConns: 30, // default=55
            webSeeds: true,
            tracker: {
                announce: global.WEBTORRENT_ANNOUNCE,
                rtcConfig: rtcConfig
            }
        })
        window.client = client // for easier debugging
        client.on('warning', util.warning)
        client.on('error', util.error)
        cb(null, client)
    })
})

function getRtcConfig(cb) {
    // TODO: add rtc

    // {
    //   "urls": "stun:stun2.l.google.com:19305?transport=udp"
    // },
    // {
    //   "urls": "stun:stun.ideasip.com?transport=udp"
    // },
    // {
    //   "urls": "stun:stun.xten.com?transport=udp"
    // },
    // {
    //   "urls": "stun:stun.ekiga.net?transport=udp"
    // },
    var rtcConfig = {
        'iceServers': [{
                "urls": "stun:stun.l.google.com:19302"
            },
            {
                "urls": "stun:global.stun.twilio.com:3478?transport=udp"
            }
        ]
    }
    get.concat({
        url: '/api/movie/rtcconfig.json',
        timeout: 5000
    }, function(err, res, data) {
        if (!err && res.statusCode == 200) {
            try {
                var oReturn = JSON.parse(data)
                if (oReturn && oReturn.data) {
                    rtcConfig = oReturn.data
                }
            } catch (err) {
                console.error("getRtcConfig,cause:", err);
            }
        }
        cb(null, rtcConfig)
    })
}

const Client = module.exports = {
    getClient
}

// exports.seedTo = seedTo
// exports.extractTo = extractTo