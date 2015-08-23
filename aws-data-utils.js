var Q = require('q');
var fs = require('fs');

var AtomicFile = require('./atomic-file');

exports.collectFromAws = function (client, clientName, method, args) {
    var d = Q.defer();
    process.nextTick(function () {
        console.log(clientName, method, args);
        var cb = function (err, data) {
            if (err === null) {
                d.resolve(data);
            } else {
                console.log(clientName, method, args, "failed with", err);
                d.reject(err);
            }
        };
        client[method].apply(client, args.concat(cb));
    });
    return d.promise;
};

exports.tidyResponseMetadata = function (data) {
    if (data.ResponseMetadata) {
        delete data.ResponseMetadata.RequestId;
        if (Object.keys(data.ResponseMetadata).length === 0) {
            delete data.ResponseMetadata;
        }
    }
    if (data.IsTruncated === false) {
        delete data.IsTruncated;
    }
    return data;
};

exports.joinResponses = function (key) {
    return function (responses) {
        var answer = {};
        answer[key] = [];

        // TODO warn if any response contains any key other than 'key'

        for (var i=0; i<responses.length; ++i) {
            answer[key] = answer[key].concat(responses[i][key]);
        }

        return answer;
    };
};

exports.deleteAsset = function (filename) {
    return Q.nfapply(fs.unlink, [filename])
        .then(function () {
            console.log("Deleted", filename);
        }, function (e) {
            if (e.code === 'ENOENT') {
                console.log("Deleted", filename);
                return true;
            } else {
                throw e;
            }
        });
};

exports.saveContentTo = function (filename) {
    return function (data) {
        return AtomicFile.writeString(data, filename);
    };
};

exports.saveJsonTo = function (filename) {
    return function (data) {
        return AtomicFile.writeJson(data, filename);
    };
};

