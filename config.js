const path = require('path')
const arch = require('arch')


const APP_VERSION = require('./package').version
const APP_NAME = 'dhtStream'

module.exports = {
    APP_NAME: APP_NAME,
    APP_VERSION: APP_VERSION,

    OS_SYSARCH: arch() === 'x64' ? 'x64' : 'ia32',

    POSTER_PATH: path.join(getConfigPath(), 'posters'),
    ROOT_PATH: path.join(__dirname, '..'),
    STATIC_PATH: path.join(__dirname, '..', 'static'),
    TORRENT_PATH: path.join(getConfigPath(), 'torrents'),
    DEFAULT_DOWNLOAD_PATH: path.join('/Users/baidu/Downloads', 'datas'),

    DELAYED_INIT: 3000, /* 3 seconds */
    STORAGE_TIMEOUT_MILLS: 50400000, /* 14 days */
    PUT_CONCURRENCY: 2
}

function getConfigPath() { return "" }