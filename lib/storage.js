const { EventEmitter } = require('events')
const Storage = module.exports = Object.assign(new EventEmitter(), {
    set,
    get,
    length,
    expire,
    remove,
    keys,
    selectDB
})

function selectDB() {
    if (window.localStorage) {
        return window.localStorage
    }
    // use cookie for localStorage
    Object.defineProperty(window, "localStorage", new(function() {
        var aKeys = [],
            oStorage = {};
        Object.defineProperty(oStorage, "getItem", {
            value: function(sKey) { return sKey ? this[sKey] : null; },
            writable: false,
            configurable: false,
            enumerable: false
        });
        Object.defineProperty(oStorage, "key", {
            value: function(nKeyId) { return aKeys[nKeyId]; },
            writable: false,
            configurable: false,
            enumerable: false
        });
        Object.defineProperty(oStorage, "setItem", {
            value: function(sKey, sValue) {
                if (!sKey) { return; }
                document.cookie = escape(sKey) + "=" + escape(sValue) + "; path=/";
            },
            writable: false,
            configurable: false,
            enumerable: false
        });
        Object.defineProperty(oStorage, "length", {
            get: function() { return aKeys.length; },
            configurable: false,
            enumerable: false
        });
        Object.defineProperty(oStorage, "removeItem", {
            value: function(sKey) {
                if (!sKey) { return; }
                var sExpDate = new Date();
                sExpDate.setDate(sExpDate.getDate() - 1);
                document.cookie = escape(sKey) + "=; expires=" + sExpDate.toGMTString() + "; path=/";
            },
            writable: false,
            configurable: false,
            enumerable: false
        });
        this.get = function() {
            var iThisIndx;
            for (var sKey in oStorage) {
                iThisIndx = aKeys.indexOf(sKey);
                if (iThisIndx === -1) { oStorage.setItem(sKey, oStorage[sKey]); } else { aKeys.splice(iThisIndx, 1); }
                delete oStorage[sKey];
            }
            for (aKeys; aKeys.length > 0; aKeys.splice(0, 1)) { oStorage.removeItem(aKeys[0]); }
            for (var iCouple, iKey, iCouplId = 0, aCouples = document.cookie.split(/\s*;\s*/); iCouplId < aCouples.length; iCouplId++) {
                iCouple = aCouples[iCouplId].split(/\s*=\s*/);
                if (iCouple.length > 1) {
                    oStorage[iKey = unescape(iCouple[0])] = unescape(iCouple[1]);
                    aKeys.push(iKey);
                }
            }
            return oStorage;
        };
        this.configurable = false;
        this.enumerable = true;
    })());
    return window.localStorage
}

function set(key, value, timeout) {
    var saveJSON = { value: value }
    if (timeout) {
        saveJSON._expire = new Date().getTime() + timeout
    }
    var sVal = JSON.stringify(saveJSON)
    selectDB().setItem(key, sVal);
}

function get(key, useExpire) {
    var sVal = selectDB().getItem(key);
    if (!sVal) {
        return
    }
    var valJSON = JSON.parse(sVal)
    var hasVal
    if (expireJSON(valJSON)) {
        if (useExpire) {
            hasVal = valJSON.value
        }
        remove(key)
    } else {
        hasVal = valJSON.value
    }
    return hasVal
}

function length() {
    return selectDB().length
}

function expire(key) {
    var sVal = selectDB().getItem(key);
    if (!sVal) {
        return false
    }
    var valJSON = JSON.parse(sVal)
    return expireJSON(valJSON)
}

function expireJSON(valJSON) {
    if (!valJSON || !valJSON._expire) {
        return false;
    }
    return new Date().getTime() > valJSON._expire
}

function remove(key) {
    return selectDB().removeItem(key);
}

function clear() {
    selectDB().clear()
}

function keys(accept) {
    var keyArr = []
    for (var sKey in selectDB()) {
        if (accept && !accept(sKey)) {
            continue
        }
        keyArr.push(sKey)
    }
    return keyArr
}