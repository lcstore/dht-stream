const TorrentPlayer = require('../lib/torrent-player')
const TorrentSummary = require('../lib/torrent-summary')
const ipcRenderer = require('./../ipc-renderer')
const Cast = require('../lib/cast')
const { UnplayableFileError, UnplayableTorrentError } = require('../lib/errors')
const HtmlCasts = require('./../lib/html-casts')

// Controls playback of torrents and files within torrents
// both local (<video>,<audio>,external player) and remote (cast)
module.exports = class PlaybackController {
    constructor(state, config, update) {
        this.state = state
        this.config = config
        this.update = update
    }

    // Play a file in a torrent.
    // * Start torrenting, if necessary
    // * Stream, if not already fully downloaded
    // * If no file index is provided, restore the most recently viewed file or autoplay the first
    playFile(infoHash, index /* optional */ ) {
        this.pauseActiveTorrents(infoHash)

        if (isPalying(infoHash, this.state)) {
            this.updatePlayer(infoHash, index, false, (err) => {
                if (err) dispatch('error', err)
                else this.play()
            })
        } else {
            const torrentSummary = TorrentSummary.getByKey(state, infoHash)
            index = index === undefined ? torrentSummary.mostRecentFileIndex : index
            if (index === undefined && torrentSummary.files) {
                index = torrentSummary.files.findIndex(TorrentPlayer.isPlayable)
            }
            if (index === undefined) {
                dispatch('error', new UnplayableTorrentError())
                return
            }
            this.openPlayer(infoHash, index, (err) => {
                if (!err) this.play()
            })
        }
    }

    // Toggle (play or pause) the currently playing media
    playPause() {
        const state = this.state
        if (state.location.url() !== 'player') return

        // force rerendering if window is hidden,
        // in order to bypass `raf` and play/pause media immediately
        const mediaTag = document.querySelector('video,audio')
        if (!state.window.isVisible && mediaTag) {
            if (state.playing.isPaused) mediaTag.play()
            else mediaTag.pause()
        }

        if (state.playing.isPaused) this.play()
        else this.pause()
    }

    pauseActiveTorrents(infoHash) {
        // Playback Priority: pause all active torrents if needed.
        if (!this.state.saved.prefs.highestPlaybackPriority) return

        // Do not pause active torrents if playing a fully downloaded torrent.
        const torrentSummary = TorrentSummary.getByKey(this.state, infoHash)
        if (!torrentSummary || torrentSummary.status === 'seeding') return

        dispatch('prioritizeTorrent', torrentSummary.infoHash)
    }


    // Play (unpause) the current media
    play() {
        const state = this.state
        if (!state.playing.isPaused) return
        state.playing.isPaused = false
        if (isCasting(state)) {
            Cast.play()
        }
        ipcRenderer.send('onPlayerPlay')
    }

    // Pause the currently playing media
    pause() {
        const state = this.state
        if (state.playing.isPaused) return
        state.playing.isPaused = true
        if (isCasting(state)) {
            Cast.pause()
        }
        ipcRenderer.send('onPlayerPause')
    }

    // Skip specified number of seconds (backwards if negative)
    skip(time) {
        this.skipTo(this.state.playing.currentTime + time)
    }

    // Skip (aka seek) to a specific point, in seconds
    skipTo(time) {
        if (!Number.isFinite(time)) {
            console.error('Tried to skip to a non-finite time ' + time)
            return console.trace()
        }
        if (isCasting(this.state)) Cast.seek(time)
        else this.state.playing.jumpToTime = time
    }

    // Change playback speed. 1 = faster, -1 = slower
    // Playback speed ranges from 16 (fast forward) to 1 (normal playback)
    // to 0.25 (quarter-speed playback), then goes to -0.25, -0.5, -1, -2, etc
    // until -16 (fast rewind)
    changePlaybackRate(direction) {
        const state = this.state
        let rate = state.playing.playbackRate
        if (direction > 0 && rate < 2) {
            rate += 0.25
        } else if (direction < 0 && rate > 0.25 && rate <= 2) {
            rate -= 0.25
        } else if (direction > 0 && rate >= 1 && rate < 16) {
            rate *= 2
        } else if (direction < 0 && rate > 1 && rate <= 16) {
            rate /= 2
        }
        state.playing.playbackRate = rate
        if (isCasting(state) && !Cast.setRate(rate)) {
            state.playing.playbackRate = 1
        }
        // Wait a bit before we hide the controls and header again
        state.playing.mouseStationarySince = new Date().getTime()
    }

    // Change the volume, in range [0, 1], by some amount
    // For example, volume muted (0), changeVolume (0.3) increases to 30% volume
    changeVolume(delta) {
        // change volume with delta value
        this.setVolume(this.state.playing.volume + delta)
    }

    // Set the volume to some value in [0, 1]
    setVolume(volume) {
        // check if its in [0.0 - 1.0] range
        volume = Math.max(0, Math.min(1, volume))

        const state = this.state
        state.playing.setVolume = volume
        if (isCasting(state)) {
            Cast.setVolume(volume)
        } else {
            state.playing.setVolume = volume
        }
    }


    // Starts WebTorrent server for media streaming
    startServer(torrentSummary, fileIndex) {
        const state = this.state
        if (torrentSummary.status === 'paused') {
            dispatch('startTorrentingSummary', torrentSummary.torrentKey)
            ipcRenderer.once('wt-ready-' + torrentSummary.infoHash,
                () => onTorrentReady())
        } else {
            onTorrentReady()
        }

        function onTorrentReady() {
            let deviceIndex = HtmlCasts.indexDevice((player) => {
                if (player.match(torrentSummary.infoHash)) {
                    player.selectFile(fileIndex)
                    player.torrentKey(torrentSummary.torrentKey)
                    return true;
                }
                return false
            })
            dispatch('selectCastDevice', deviceIndex)

            ipcRenderer.send('wt-start-server', torrentSummary.infoHash)
            ipcRenderer.once('wt-server-running', () => { state.playing.isReady = true })
        }
    }

    // Called each time the current file changes
    updatePlayer(infoHash, index, resume, cb) {
        const state = this.state

        const torrentSummary = TorrentSummary.getByKey(state, infoHash)
        const fileSummary = torrentSummary.files[index]

        if (!TorrentPlayer.isPlayable(fileSummary)) {
            torrentSummary.mostRecentFileIndex = undefined
            return cb(new UnplayableFileError())
        }

        torrentSummary.mostRecentFileIndex = index

        // update state
        state.playing.infoHash = torrentSummary.infoHash
        state.playing.fileIndex = index
        state.playing.type = TorrentPlayer.isVideo(fileSummary) ? 'video' :
            TorrentPlayer.isAudio(fileSummary) ? 'audio' :
            'other'

        // pick up where we left off
        let jumpToTime = 0
        if (resume && fileSummary.currentTime) {
            const fraction = fileSummary.currentTime / fileSummary.duration
            const secondsLeft = fileSummary.duration - fileSummary.currentTime
            if (fraction < 0.9 && secondsLeft > 10) {
                jumpToTime = fileSummary.currentTime
            }
        }
        state.playing.jumpToTime = jumpToTime
        // if it's audio, parse out the metadata (artist, title, etc)
        if (torrentSummary.status === 'paused') {
            ipcRenderer.once('wt-ready-' + torrentSummary.infoHash, getAudioMetadata)
        } else {
            getAudioMetadata()
        }

        function getAudioMetadata() {
            if (state.playing.type === 'audio' && !fileSummary.audioInfo) {
                ipcRenderer.send('wt-get-audio-metadata', torrentSummary.infoHash, index)
            }
        }

        // if it's video, check for subtitles files that are done downloading
        // TODO 是否必要打开
        // dispatch('checkForSubtitles')

        // enable previously selected subtitle track
        if (fileSummary.selectedSubtitle) {
            dispatch('addSubtitles', [fileSummary.selectedSubtitle], true)
        }

        state.window.title = fileSummary.name

        // otherwise, play the video
        this.update()

        cb()
    }

    // Opens the video player to a specific torrent
    openPlayer(infoHash, index, cb) {
        const state = this.state
        const torrentSummary = TorrentSummary.getByKey(state, infoHash)

        state.playing.infoHash = torrentSummary.infoHash
        state.playing.isReady = false

        // update UI to show pending playback
        // sound.play('PLAY')



        this.startServer(torrentSummary, index)
        ipcRenderer.send('onPlayerOpen')
        this.updatePlayer(infoHash, index, true, cb)
    }

    closePlayer() {
        console.log('closePlayer')

        // Quit any external players, like Chromecast/Airplay/etc or VLC
        const state = this.state
        if (isCasting(state)) {
            Cast.stop()
        }

        // Save volume (this session only, not in state.saved)
        state.previousVolume = state.playing.volume

        // Reset the window contents back to the home screen
        state.playing = State.getDefaultPlayState()
        state.server = null

        // Tell the WebTorrent process to kill the torrent-to-HTTP server
        ipcRenderer.send('wt-stop-server')

        ipcRenderer.send('onPlayerClose')

        // Playback Priority: resume previously paused downloads.
        if (this.state.saved.prefs.highestPlaybackPriority) {
            dispatch('resumePausedTorrents')
        }

        this.update()
    }
}

function isPalying(infoHash, state) {
    return infoHash && state.playing && state.playing.infoHash == infoHash
}

function dispatch(event, ...args) {
    ipcRenderer.send('dispatch', event, ...args)
}

// Checks whether we are connected and already casting
// Returns false if we not casting (state.playing.location === 'local')
// or if we're trying to connect but haven't yet ('chromecast-pending', etc)
function isCasting(state) {
    return state.playing.location === 'htmlcast'
}