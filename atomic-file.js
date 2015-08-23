var CanonicalJson = require('canonical-json');
var Q = require('q');
var fs = require('fs');

var writeString = function (body, filename) {
    var tmpFilename = filename + ".tmp";
    var d = Q.defer();

    process.nextTick(function () {
        console.log("saving to", tmpFilename);
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
                        console.log("saved to", filename);
                        d.resolve(filename);
                    }
                });
            }
        });
    });

    return d.promise;
};

var writeJson = function (data, filename) {
    return writeString(CanonicalJson(data, null, 2)+"\n", filename);
};

module.exports = {
    writeString: writeString,
    writeJson: writeJson
};
