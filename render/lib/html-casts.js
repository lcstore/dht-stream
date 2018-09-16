const { EventEmitter } = require('events')
const HtmlPlayer = require('./html-player')
// const ipcRenderer = require('./../ipc-renderer')

const players = []

module.exports = Object.assign(new EventEmitter(), {
    addDevice,
    indexDevice,
    players
})


function addDevice(device, torrentId) {
    if (!device) return
    const player = new HtmlPlayer(device, torrentId)
    players.push(player)

    this.emit('update', player)
}

function indexDevice(filter) {
    if (!filter) return
    return players.findIndex((player) => {
        return filter(player)
    })
}