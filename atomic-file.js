var CanonicalJson = require('canonical-json');
var Q = require('q');
var fs = require('fs');
var path = require('path');

var TreeMaker = require('./tree-maker');

var writeString = function (body, filename) {
    return TreeMaker.mkpath(path.dirname(filename)).then(function () {
        var tmpFilename = filename + ".tmp";
        var d = Q.defer();

        process.nextTick(function () {
            fs.writeFile(tmpFilename, body, {'flag': 'w'}, function(err) {
                if (err) {
                    fs.unlink(tmpFilename, function(unlinkErr) {
                        // ignore unlinkErr
                        d.reject(err);
                    });
                } else {
                    fs.rename(tmpFilename, filename, function(err) {
                        if (err) {
                            fs.unlink(tmpFilename, function(unlinkErr) {
                                // ignore unlinkErr
                                d.reject(err);
                            });
                        } else {
                            console.log("Wrote", body.length, "bytes to", filename);
                            d.resolve(body);
                        }
                    });
                }
            });
        });

        return d.promise;
    });
};

var writeJson = function (data, filename) {
    return writeString(CanonicalJson(data, null, 2)+"\n", filename).thenResolve(data);
};

module.exports = {
    writeString: writeString,
    writeJson: writeJson
};
