const TorrentSummary = require('./torrent-summary')
const config = require('../../config')
const { CastingError } = require('./errors')
const htmlcasts = require('./html-casts')
// The Cast module talks to Airplay and Chromecast
// * Modifies state when things change
// * Starts and stops casting, provides remote video controls
module.exports = {
    init,
    toggleMenu,
    selectDevice,
    stop,
    play,
    pause,
    seek,
    setVolume,
    setRate
}

// App state. Cast modifies state.playing and state.errors in response to events
let state
let ipcRender

// Callback to notify module users when state has changed
let update

// setInterval() for updating cast status
let statusInterval = null

// Start looking for cast devices on the local network
function init(appState, callback) {
    state = appState
    update = callback


    state.devices.htmlcast = htmlcastPlayer()

    htmlcasts.on('update', function(device) {
        state.devices.htmlcast.addDevice(device)
    })
}

// chromecast player implementation
function htmlcastPlayer() {
    const ret = {
        device: null,
        addDevice,
        getDevices,
        open,
        play,
        pause,
        stop,
        status,
        seek,
        volume
    }
    return ret

    function getDevices() {
        // return [{name: type + '-1'}, {name: type + '-2'}]
        return htmlcasts.players
    }

    function addDevice(device) {
        update()
    }

    function open() {
        // 由于播放器有多个，用state.playing会出现混淆现象
        // const infoHash = state.playing.infoHash
        // const fileIndex = state.playing.fileIndex
        // const torrentSummary = TorrentSummary.getByKey(state, infoHash)
        ret.device.play(null, {
            open: true,
            type: 'video/mp4',
            title: config.APP_NAME
        }, function(err) {
            if (err) {
                state.playing.location = 'local'
                state.errors.push({
                    time: new Date().getTime(),
                    message: 'Could not connect to htmlcast. ' + err.message
                })
            } else {
                state.playing.location = 'htmlcast'
            }

        })
    }

    function play(callback) {
        ret.device.play(null, null, callback)
    }

    function pause(callback) {
        ret.device.pause(callback)
    }

    function stop(callback) {
        ret.device.stop(callback)
    }

    function status() {
        ret.device.status(handleStatus)
    }

    function seek(time, callback) {
        ret.device.seek(time, callback)
    }

    function volume(volume, callback) {
        ret.device.volume(volume, callback)
    }

    function rate(rate, callback) {
        ret.device.rate(rate, callback)
    }
}

function handleStatus(err, status) {
    if (err || !status) {
        return console.log('error getting %s status: %o',
            state.playing.location,
            err || 'missing response')
    }
    state.playing.isPaused = status.playerState === 'PAUSED'
    state.playing.currentTime = status.currentTime
    state.playing.volume = status.volume.muted ? 0 : status.volume.level
    update()
}

// Start polling cast device state, whenever we're connected
function startStatusInterval() {
    statusInterval = setInterval(function() {
        const player = getPlayer()
        if (player) {
            player.status()
        }
    }, 1000)
}

/*
 * Shows the device menu for a given cast type ('chromecast', 'airplay', etc)
 * The menu lists eg. all Chromecasts detected; the user can click one to cast.
 * If the menu was already showing for that type, hides the menu.
 */
function toggleMenu(location) {
    // If the menu is already showing, hide it
    if (state.devices.castMenu && state.devices.castMenu.location === location) {
        // state.devices.castMenu = null
        return
    }

    // Never cast to two devices at the same time
    // if (state.playing.location !== 'local') {
    //     throw new CastingError(
    //         `You can't connect to ${location} when already connected to another device`
    //     )
    // }

    // Find all cast devices of the given type
    const player = getPlayer(location)
    const devices = player ? player.getDevices() : []
    if (devices.length === 0) {
        // throw new CastingError(`No ${location} devices available`)
    }

    // Show a menu
    state.devices.castMenu = { location, devices }
}

function selectDevice(index) {
    if (!state.devices.castMenu) {
        toggleMenu('htmlcast')
    }
    const { location, devices } = state.devices.castMenu
    // Start casting
    const player = getPlayer(location)
    player.device = devices[index]
    player.open()

    // Poll the casting device's status every few seconds
    startStatusInterval()

    // Show the Connecting... screen
    state.devices.castMenu = null
    state.playing.castName = devices[index].name
    state.playing.location = location + '-pending'
    update()
}

// Stops casting, move video back to local screen
function stop() {
    const player = getPlayer()
    if (player) {
        player.stop(function() {
            player.device = null
            stoppedCasting()
        })
        clearInterval(statusInterval)
    } else {
        stoppedCasting()
    }
}

function stoppedCasting() {
    state.playing.location = 'local'
    state.playing.jumpToTime = Number.isFinite(state.playing.currentTime) ?
        state.playing.currentTime :
        0
    update()
}

// location: local,htmlcast
function getPlayer(location) {
    if (location) {
        return state.devices[location]
    } else if (state.playing.location === 'htmlcast') {
        return state.devices.htmlcast
    } else {
        return null
    }
}

function play() {
    const player = getPlayer()
    if (player) player.play(castCallback)
}

function pause() {
    const player = getPlayer()
    if (player) player.pause(castCallback)
}

function setRate(rate) {
    const player = getPlayer()
    if (player) player.rate(rate, castCallback)
}

function seek(time) {
    const player = getPlayer()
    if (player) player.seek(time, castCallback)
}

function setVolume(volume) {
    const player = getPlayer()
    if (player) player.volume(volume, castCallback)
}

function castCallback() {
    console.log('%s callback: %o', state.playing.location, arguments)
}