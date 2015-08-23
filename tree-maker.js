var Q = require('q');
var mkdirp = require('mkdirp');

var cache = {};

var mkpath = function (dir) {
    if (cache[dir]) return cache[dir];
    return(cache[dir] = Q.nfapply(mkdirp, [dir]));
};

module.exports = {
    mkpath: mkpath
};
