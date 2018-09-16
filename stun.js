const stun = require("node-stun")
var readline = require('readline');
var fs = require('fs');
var os = require('os');
const parallelLimit = require('run-parallel-limit')

var fReadName = './stun.dat';
var fWriteName = './stun.ok';
var fRead = fs.createReadStream(fReadName);
var fWrite = fs.createWriteStream(fWriteName);

var objReadline = readline.createInterface({
    input: fRead
});
var addrs = []
var index = 1;
objReadline.on('line', (line) => {
    var unitArr = line.split(':')
    var serverAddr = unitArr[0]
    var port = 3478
    if (unitArr && unitArr[1]) {
        port = parseInt(unitArr[1])
    }
    if (line == '' || port > 65536) {
        return false
    }
    if ('0.0.0.0:0' == serverAddr || !serverAddr || serverAddr == '') {
        return false
    }
    addrs.push({ host: serverAddr, port: port })
    index++;
});

objReadline.on('close', () => {
    console.log('readline close...');
    var funcObj = {}
    var index  = 1
    addrs.forEach((addr) => {
        funcObj[index] = function(acb) {
            var serverAddr = addr.host
            var port = addr.port
            console.log("exec:" + index + ",host:" + serverAddr + ",port:" + port);
            var client = stun.createClient();
            client.setServerAddr(serverAddr, port);
            try {
                var start = new Date().getTime()
                client.start(function(result) {
                    var cost = new Date().getTime() + start
                    var mapped = client.getMappedAddr();
                    console.log([
                        "Complete(" + result + "): ",
                        (client.isNatted() ? "Natted" : "Open"),
                        " NB=" + client.getNB(),
                        " EF=" + client.getEF(),
                        " (" + client.getNatType() + ")",
                        " mapped=" + mapped.address + ":" + mapped.port,
                        " rtt=" + client.getRtt()
                    ].join(''));

                    client.close(function() {
                        if (result == 0) {
                            fWrite.write(serverAddr + ":" + port + "\t" + cost + os.EOL);
                        }
                        acb()
                    });
                });
            } catch (e) {
                console.error("cccc,", e);
            }
        }
        index++
    })
    parallelLimit(funcObj, 2, (err, results) => {
        console.error("parallelLimit.done,", err);
    })
});