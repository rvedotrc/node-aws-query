var Q = require('q');
var fs = require('fs');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
var Executor = require('./executor');

var executor = new Executor(10);

var doCollectFromAws = function(nextJob, deferred, client, clientName, method, args, listKey, joinTo) {
    console.log(clientName, method, args);
    var cb = function (err, data) {
        if (err === null) {
            if (joinTo !== undefined) {
                if (!listKey) return deferred.reject(new Error("joinTo with no listKey"));
                data[listKey] = joinTo[listKey].concat(data[listKey]);
            }

            // Marker / IsTruncated -style pagination
            if (data.IsTruncated === true) {
                if (!data.Marker) {
                    return deferred.reject(new Error("response IsTruncated, but has no Marker"));
                }
                args = merge(args, { Marker: data.Marker });
                console.log("truncated (got", data[listKey].length, "results so far), will query again with Marker", data.Marker);
                if (!listKey) {
                    return deferred.reject(new Error("response IsTruncated, but no listKey provided"));
                }
                return doCollectFromAws(nextJob, deferred, client, clientName, method, args, listKey, data);
            }

            // NextToken -style pagination
            if (data.NextToken) {
                args = merge(args, { NextToken: data.NextToken });
                console.log("truncated (got", data[listKey].length, "results so far), will query again with NextToken", data.NextToken);
                if (!listKey) {
                    return deferred.reject(new Error("response has NextToken, but no listKey provided"));
                }
                return doCollectFromAws(nextJob, deferred, client, clientName, method, args, listKey, data);
            }

            deferred.resolve(data);
        } else {
            console.log(clientName, method, args, "failed with", err);
            deferred.reject(err);
        }
        nextJob();
    };
    client[method].apply(client, [args, cb]);
};

exports.collectFromAws = function (client, clientName, method, args, listKey) {
    var deferred = Q.defer();
    executor.submit(doCollectFromAws, deferred, client, clientName, method, args, listKey);
    return deferred.promise;
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

exports.decodeJsonInline = function (key) {
    return function (data) {
        if (data[key] !== null && data[key] !== undefined) {
            data[key] = JSON.parse(data[key]);
        }
        return data;
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

