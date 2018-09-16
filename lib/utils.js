
exports.log = function log (msg) {
  console.log(msg);
}

exports.info = function info (msg) {
  console.info(msg);
}

exports.warning = function warning (err) {
  console.error(err.stack || err.message || err)
}

exports.error = function error (err) {
  console.error(err.stack || err.message || err)
}