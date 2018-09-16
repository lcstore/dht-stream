const { EventEmitter } = require('events')
const TORRENT_DB_NAME = 'torrentDB'
const PIECE_DB_VERION = 9
const TABLE_PIECE = 'pieces'
const TABLE_META = 'meta'
const TABLE_LIST = [{
        name: TABLE_META,
        keyOption: { autoIncrement: true },
        overwrite: true,
        createIndex: function(store) {
            store.createIndex("by_key", "key", { unique: true })
        }
    },
    {
        name: TABLE_PIECE,
        keyOption: { autoIncrement: true },
        overwrite: false,
        createIndex: function(store) {
            store.createIndex("by_key", "key", { unique: true })
        }
    }
]
const Indexer = module.exports = Object.assign(new EventEmitter(), {
    dataBase,
    table,
    put,
    remove,
    get,
    indexGet,
    piecePut,
    pieceDel,
    pieceGet,
    metaPut,
    metaGet,
    metaGetId,
    metaAllKeys
})


function indexedDB() {
    return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB
}
const dbDict = {}

function dataBase(name, version, cb) {
    var curKey = name + ':' + version
    if (!indexedDB()) return cb('unsupport indexedDB')
    if (dbDict[curKey]) return cb(null, dbDict[curKey])
    const useIndexedDB = indexedDB()
    var request = useIndexedDB.open(name, version);
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
    request.onerror = function(event) {
        console.error('open dataBase[' + name + '],cause:', request.error);
        cb(request.error)
    }
    request.onupgradeneeded = function(event) {
        var db = this.result;
        var keyOption = { autoIncrement: true }
        TABLE_LIST.map((tableOpt) => {
            var tableName = tableOpt.name
            if (tableOpt.overwrite && db.objectStoreNames.contains(tableName)) {
                db.deleteObjectStore(tableName)
            }
            if (!db.objectStoreNames.contains(tableName)) {
                var keyOption = tableOpt.keyOption
                var store = db.createObjectStore(tableName, keyOption);
                tableOpt.createIndex(store)
            }
        })
        var oldKey = db.name + ':' + event.oldVersion
        delete dbDict[oldKey]
        dbDict[curKey] = db
        db.onversionchange = function(event) {
            db.close();
            console.error("onversionchange:" + event.oldVersion + ",version:" + event.version + ",reload ");
        };
    }
}

function table(db, tableName, keyOption, overwrite, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!keyOption) return cb(new Error('keyOption is null'))
    if (!overwrite && db.objectStoreNames.contains(db.objectStoreNames)) {
        return
    }
    db.objectStoreNames.remove(tableName)
    db.createObjectStore(tableName, keyOption);
}

function put(database, tableName, value, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!database.objectStoreNames.contains(tableName)) return cb(new Error('miss table:' + tableName))
    var transaction = database.transaction([tableName], "readwrite"); //读写
    var request = transaction.objectStore(tableName).put(value);
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
}

function remove(database, tableName, id, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!id) return cb(new Error('id is null'))
    if (!database.objectStoreNames.contains(tableName)) return cb(new Error('miss table:' + tableName))
    var transaction = database.transaction([tableName], "readwrite"); //读写
    var request = transaction.objectStore(tableName).delete(id);
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
}

function get(database, tableName, id, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!id) return cb(new Error('id is null'))
    if (!database.objectStoreNames.contains(tableName)) return cb(new Error('miss table:' + tableName))
    var transaction = database.transaction([tableName], "readonly"); //读写
    var request = transaction.objectStore(tableName).get(id);
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
}

function indexGet(database, tableName, indexOpt, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!indexOpt) return cb(new Error('indexOpt is null'))
    if (!database.objectStoreNames.contains(tableName)) return cb(new Error('miss table:' + tableName))
    var transaction = database.transaction([tableName], "readonly");
    var request = transaction.objectStore(tableName).index(indexOpt.name).get(indexOpt.value)
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
}

function getAllKeys(database, tableName, queryOpt, cb) {
    if (!database) return cb(new Error('database is null'))
    if (!tableName) return cb(new Error('tableName is null'))
    if (!database.objectStoreNames.contains(tableName)) return cb(new Error('miss table:' + tableName))
    queryOpt = queryOpt || {}
    var transaction = database.transaction([tableName], "readonly");
    var request = transaction.objectStore(tableName).getAllKeys(queryOpt.query, queryOpt.count)
    request.onsuccess = function(event) {
        cb(null, this.result)
    }
}


function piecePut(infoHash, index, buf, cb) {

    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        var value = {}
        value.key = infoHash + ":" + index
        value.data = buf.toString('base64')
        put(db, TABLE_PIECE, value, cb)

    })
}

function pieceGet(infoHash, index, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        const key = infoHash + ":" + index
        indexGet(db, TABLE_PIECE, { name: "by_key", value: key }, cb)
    })
}

function pieceDel(infoHash, index, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        const key = infoHash + ":" + index
        remove(db, TABLE_PIECE, key, cb)
    })
}

function metaPut(infoHash, sVal, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        var value = {}
        value.key = infoHash
        value.data = sVal
        value.ctime = new Date().getTime()
        put(db, TABLE_META, value, cb)
    })
}

function metaGet(infoHash, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        indexGet(db, TABLE_META, { name: "by_key", value: infoHash }, cb)
    })
}

function metaGetId(id, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        get(db, TABLE_META, id, cb)
    })
}

function metaAllKeys(queryOpt, cb) {
    dataBase(TORRENT_DB_NAME, PIECE_DB_VERION, (err, db) => {
        if (err) return cb(err)
        if (!db) return cb(new Error('Get dataBase fail'))
        getAllKeys(db, TABLE_META, queryOpt, cb)
    })
}