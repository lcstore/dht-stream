console.time('initMain')

const createGetter = require('fn-getter')
const utils = require('./../lib/utils')
const ClientListener = require('./../lib/client-listener')
const ipcRenderer = require('./ipc-renderer')
const config = require('./../config')
const Cast = require('./lib/cast')

let state = null
let castInit = false
let prevProgress = null
let controllers = null


ClientListener.init((err, _state) => {
    if (err) return onError(err)
    // Make available for easier debugging
    state = window.state = _state

    controllers = {
        torrent: createGetter(() => {
            const TorrentController = require('./controllers/torrent-controller')
            return new TorrentController(state)
        }),
        torrentList: createGetter(() => {
            const TorrentListController = require('./controllers/torrent-list-controller')
            return new TorrentListController(state)
        }),
        playback: createGetter(() => {
            const PlaybackController = require('./controllers/playback-controller')
            return new PlaybackController(state, config, update)
        }),
    }
    // Restart everything we were torrenting last time the app ran
    resumeTorrents()

    setupIpc()

    // To keep app startup fast, some code is delayed.
    window.setTimeout(delayedInit, config.DELAYED_INIT)

    console.timeEnd('initMain')

})

function delayedInit() {
    lazyLoadCast().toggleMenu('htmlcast')

}

// Lazily loads Chromecast and Airplay support
function lazyLoadCast() {
    if (!castInit) {
        Cast.init(state, update) // Search the local network for Chromecast and Airplays
        castInit = true
    }
    return Cast
}


// Listen to events from the main and webtorrent processes
function setupIpc() {
    ipcRenderer.on('log', (e, ...args) => console.log(...args))
    ipcRenderer.on('error', (e, ...args) => console.error(...args))

    ipcRenderer.on('dispatch', (e, ...args) => dispatch(...args))

    const tc = controllers.torrent()
    ipcRenderer.on('wt-infohash', (e, ...args) => tc.torrentInfoHash(...args))
    ipcRenderer.on('wt-metadata', (e, ...args) => tc.torrentMetadata(...args))
    ipcRenderer.on('wt-done', (e, ...args) => tc.torrentDone(...args))
    ipcRenderer.on('wt-done', () => controllers.torrentList().resumePausedTorrents())
    ipcRenderer.on('wt-warning', (e, ...args) => tc.torrentWarning(...args))
    ipcRenderer.on('wt-error', (e, ...args) => tc.torrentError(...args))

    ipcRenderer.on('wt-progress', (e, ...args) => tc.torrentProgress(...args))
    ipcRenderer.on('wt-file-modtimes', (e, ...args) => tc.torrentFileModtimes(...args))
    ipcRenderer.on('wt-file-saved', (e, ...args) => tc.torrentFileSaved(...args))
    ipcRenderer.on('wt-poster', (e, ...args) => tc.torrentPosterSaved(...args))
    ipcRenderer.on('wt-audio-metadata', (e, ...args) => tc.torrentAudioMetadata(...args))
    ipcRenderer.on('wt-server-running', (e, ...args) => tc.torrentServerRunning(...args))

    ipcRenderer.on('wt-uncaught-error', (e, err) => {
        console.error('main.error:', err || e)
    })

    ipcRenderer.send('ipcReady')

}

const dispatchHandlers = {
    // Torrent list: creating, deleting, selecting torrents
    'addTorrent': (torrentId, tOptions) => controllers.torrentList().addTorrent(torrentId, tOptions),
    'showCreateTorrent': (paths) => controllers.torrentList().showCreateTorrent(paths),
    'createTorrent': (options) => controllers.torrentList().createTorrent(options),
    'toggleTorrent': (infoHash) => controllers.torrentList().toggleTorrent(infoHash),
    'pauseAllTorrents': () => controllers.torrentList().pauseAllTorrents(),
    'resumeAllTorrents': () => controllers.torrentList().resumeAllTorrents(),
    'toggleTorrentFile': (infoHash, index) =>
        controllers.torrentList().toggleTorrentFile(infoHash, index),
    'confirmDeleteTorrent': (infoHash, deleteData) =>
        controllers.torrentList().confirmDeleteTorrent(infoHash, deleteData),
    'deleteTorrent': (infoHash, deleteData) =>
        controllers.torrentList().deleteTorrent(infoHash, deleteData),
    'toggleSelectTorrent': (infoHash) =>
        controllers.torrentList().toggleSelectTorrent(infoHash),
    'openTorrentContextMenu': (infoHash) =>
        controllers.torrentList().openTorrentContextMenu(infoHash),
    'startTorrentingSummary': (torrentKey) =>
        controllers.torrentList().startTorrentingSummary(torrentKey),
    'saveTorrentFileAs': (torrentKey) =>
        controllers.torrentList().saveTorrentFileAs(torrentKey),
    'prioritizeTorrent': (infoHash) => controllers.torrentList().prioritizeTorrent(infoHash),
    'resumePausedTorrents': () => controllers.torrentList().resumePausedTorrents(),

    // Playback
    'playFile': (infoHash, index) => controllers.playback().playFile(infoHash, index),
    'playPause': () => controllers.playback().playPause(),
    'skip': (time) => controllers.playback().skip(time),
    'skipTo': (time) => controllers.playback().skipTo(time),
    'changePlaybackRate': (dir) => controllers.playback().changePlaybackRate(dir),
    'changeVolume': (delta) => controllers.playback().changeVolume(delta),
    'setVolume': (vol) => controllers.playback().setVolume(vol),

    // Remote casting: Htmlcast, local, etc
    'toggleCastMenu': (deviceType) => lazyLoadCast().toggleMenu(deviceType),
    'selectCastDevice': (index) => lazyLoadCast().selectDevice(index),
    'stopCasting': () => lazyLoadCast().stop(),

    // Everything else
    'error': onError,
    'uncaughtError': (proc, err) => utils.error(err),
    'stateSaveImmediate': () => State.saveImmediate(state),
    'update': () => {} // No-op, just trigger an update
}



// Events from the UI never modify state directly. Instead they call dispatch()
function dispatch(action, ...args) {
    // Log dispatch calls, for debugging, but don't spam
    // if (!['mediaMouseMoved', 'mediaTimeUpdate', 'update'].includes(action)) {
    //     console.log('dispatch: %s %o', action, args)
    // }

    const handler = dispatchHandlers[action]
    if (handler) handler(...args)
    else console.error('Missing dispatch handler: ' + action)
}

function onError(err) {
    console.error(err.stack || err)
    update()
}

function update() {
    // no operation
}
// Starts all torrents that aren't paused on program startup
function resumeTorrents() {
    state.saved.torrents
        .map((torrentSummary) => {
            // Torrent keys are ephemeral, reassigned each time the app runs.
            // On startup, give all torrents a key, even the ones that are paused.
            torrentSummary.torrentKey = state.nextTorrentKey++
                return torrentSummary
        })
        .filter((s) => s.status !== 'paused')
        .forEach((s) => controllers.torrentList().startTorrentingSummary(s.torrentKey))
}