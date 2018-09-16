const { EventEmitter } = require('events')
const util = require('./../lib/utils')

const ipcRenderer = window.ipc = module.exports = Object.assign(new EventEmitter(), {
    send
})

function send(event, ...args) {
    var argsFirst = args[0]
    var error = null
    if (argsFirst instanceof Error) {
        error = argsFirst
        args = args.slice(1)
    }
    // console.log('send:' + event + ',error:' + JSON.stringify(error) + ',args:' + JSON.stringify(args));
    this.emit(event, error, ...args)
}