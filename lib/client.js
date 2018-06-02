// .mkv 全下载完了才能播放
var WebTorrent = require('webtorrent-hybrid')
// var WebTorrent = require('webtorrent')
var createTorrent = require('create-torrent')
var thunky = require('thunky')
var util = require('./utils')

var DISALLOWED = [
  '6feb54706f41f459f819c0ae5b560a21ebfead8f'
]

global.WEBTORRENT_ANNOUNCE = createTorrent.announceList
  .map(function (arr) {
    return arr[0]
  })
  .filter(function (url) {
    return url.indexOf('wss://') === 0 || url.indexOf('ws://') === 0
  })

// 延迟执行并缓存结果
var getClient = thunky(function (cb) {
  getRtcConfig(function (err, rtcConfig) {
    if (err) util.error(err)
    var client = new WebTorrent({
      maxConns: 30, // default=55
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

function getRtcConfig (cb) {
  // TODO: add rtc

      // {
          //   "urls": "stun:stun1.l.google.com:19305?transport=udp"
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
    'iceServers': [
          // {
          //   "urls": "stun:stun1.l.google.com:19305?transport=udp"
          // },
          {
            "credential": "YzYNCouZM1mhqhmseWk6",
            "urls": "turn:13.250.13.83:3478?transport=udp",
            "username": "YzYNCouZM1mhqhmseWk6"
          }
          // ,
          // {
          //   "credential": "webrtc",
          //   "urls": "turn:turn.anyfirewall.com:443?transport=tcp",
          //   "username": "webrtc"
          // }
    ]
  }
  cb(null, rtcConfig)
}

function extractTo (torrentId, options, onTorrent) {
  var disallowed = DISALLOWED.some(function (infoHash) {
    return typeof(torrentId) == "string" && torrentId.indexOf(infoHash) >= 0
  })

  if (disallowed) {
    util.log('File not found ' + torrentId)
  } else {
    util.log('Downloading torrent from ' + torrentId)
    getClient(function (err, client) {
      if (err) return util.error(err)
      client.add(torrentId, options, function(torrent){
        onLimitPeer(torrent, options ? options.maxPeers : 0)
        return onTorrent(torrent, err)
      })
    })
  }
}

function seedTo (files, options, onTorrent) {
  if (!files || files.length === 0) return
  util.log('Seeding ' + files.length + ' files')
  // options.announce = options.announce || createTorrent.announceList
  // Seed from WebTorrent
  getClient(function (err, client) {
    if (err) return util.error(err)
    client.seed(files, options, function(torrent){
        onLimitPeer(torrent, options ? options.maxPeers : 0)
        return onTorrent(torrent, err)
    })
  })
}

function onLimitPeer(torrent, maxPeers) {
    if (!torrent || !maxPeers || maxPeers < 1) {
      return
    }
    torrent.on('peer', function(peer) {
      var bLimit = torrent.numPeers >= maxPeers
      if (bLimit) {
        torrent.pause()
      }
      var addr = peer.addr || peer.id
      util.log('addPeer:' + addr + ",torrent:" + torrent.name + ',numPeers:' + torrent.numPeers + ',limit:' + bLimit)
    })
}

exports.seedTo = seedTo
exports.extractTo = extractTo