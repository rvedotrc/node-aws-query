/*
Copyright 2016 Rachel Evans

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var Q = require('q');
var FixedSizeExecutor = require('fixed-size-executor');
var fs = require('fs');
var merge = require('merge');

var executors = {};
var executorConcurrency = 10;
var executorForClient = function (client) {
    var key = client.endpoint.hostname || "default";
    if (!executors[key]) executors[key] = new FixedSizeExecutor(executorConcurrency);
    return executors[key];
};

var rejectIfContainsPagination = function (deferred, data) {
    var stringKeys = [];
    var arrayKeys = [];

    for (var p in data) {
        if (typeof(data[p]) === 'string') {
            stringKeys.push(p);
        } else if (Array.isArray(data[p])) {
            arrayKeys.push(p);
        }
    }

    if (arrayKeys.length === 1 && stringKeys.length === 1) {
        deferred.reject(
            "Response seems to contain pagination data, but no paginationHelper was provided." +
            " Keys are: " + Object.keys(data).sort().join(",")
        );
    }
};

var doCollectFromAws = function(nextJob, deferred, client, method, args, paginationHelper) {
    if (!args) args = {};
    console.log("collectFromAws", client.serviceIdentifier, client.config.region, method, JSON.stringify(args));

    var cb = function (err, data) {
        if (err === null) {
            if (paginationHelper) {
                var nextArgs = paginationHelper.nextArgs(args, data);
                if (nextArgs) {
                    var promiseOfNextData = (exports.collectFromAws)(client, method, nextArgs, paginationHelper);
                    var promiseOfJoinedData = Q.all([ Q(data), promiseOfNextData ])
                        .spread(paginationHelper.promiseOfJoinedData);
                    deferred.resolve(promiseOfJoinedData);
                }
            } else {
                rejectIfContainsPagination(deferred, data);
            }

            // Resolving a deferred twice (see above) is OK.  First wins.
            deferred.resolve(data);
        } else {
            var delay;
            if (err.code === 'Throttling' || err.code === 'TooManyRequestsException') {
                delay = exports.getDelay();
                console.log("Will try again in", delay, "ms");
                setTimeout(function () {
                    client[method].apply(client, [args, cb]);
                }, delay);
            } else if (err.retryable === true) {
                delay = 2000;
                console.log("collectFromAws failed but will retry shortly", client.serviceIdentifier, client.config.region, method, JSON.stringify(args), err);
                setTimeout(function () {
                    client[method].apply(client, [args, cb]);
                }, delay);
            } else {
                console.log("collectFromAws failed", client.serviceIdentifier, client.config.region, method, JSON.stringify(args), err);
                deferred.reject(err);
            }
        }
        nextJob();
    };

    client[method].apply(client, [args, cb]);
};

// How long to wait on Throttling errors.  Used for testing.
exports.getDelay = function () {
    return 1000 + Math.random() * 5000;
};

exports.collectFromAws = function (client, method, args, paginationHelper) {
    var deferred = Q.defer();
    executorForClient(client).submit(doCollectFromAws, deferred, client, method, args, paginationHelper);
    return deferred.promise;
};

exports.paginationHelper = function (responseTokenField, requestTokenField, responseListField) {
    return {
        nextArgs: function (args, data) {
            if (!data[responseTokenField]) return;
            var toMerge = {};
            toMerge[requestTokenField] = data[responseTokenField];
            return merge({}, args, toMerge);
        },
        promiseOfJoinedData: function (data1, data2) {
            if (!data1[responseListField] || !data2[responseListField]) {
                console.log("data1", data1);
                console.log("data2", data2);
                throw new Error("Can't join pages - at least one of them is missing " + responseListField);
            }
            var toMerge = {};
            toMerge[responseListField] = data1[responseListField].concat(data2[responseListField]);
            return merge({}, data2, toMerge);
        }
    };
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

exports.setConcurrency = function (n) {
    executorConcurrency = n;
    executors = {};
};

