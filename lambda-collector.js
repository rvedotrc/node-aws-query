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

var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

var regions = require('./regions').regionsForService('lambda');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.Lambda(config));
};

var getFunctionPolicy = function (client, region, functionName) {
    return AwsDataUtils.collectFromAws(client, "getPolicy", {FunctionName: functionName})
        .then(function (r) {
            return Q(r)
                .then(AwsDataUtils.decodeJsonInline("Policy"))
                .then(AtomicFile.saveJsonTo("var/service/lambda/region/"+region+"/function/"+functionName+"/policy.json"));
        }, function (e) {
            if (e.code == "ResourceNotFoundException") return;
            throw e;
        });
};

var getAllFunctionPolicies = function (client, region, functions) {
    return Q.all(
        functions.Functions.map(function (f) {
            var n = f.FunctionName;
            return Q([ client, region, n ]).spread(getFunctionPolicy);
        })
    );
};

var listFunctions = function (client) {
    // pagination: NextMarker
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Functions");

    return AwsDataUtils.collectFromAws(client, "listFunctions", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Functions.sort(function (a, b) {
                if (a.FunctionArn < b.FunctionArn) return -1;
                else if (a.FunctionArn > b.FunctionArn) return +1;
                else return 0;
            });
            return r;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var functions = client.then(listFunctions).then(AtomicFile.saveJsonTo("var/service/lambda/region/"+region+"/list-functions.json"));

    var getAllPolicies = Q.all([ client, region, functions ]).spread(getAllFunctionPolicies);

    // A note on event sources:

    // For "pull" events (kinesis streams, etc), could call
    // getEventSourceMapping.

    // For "push" events, the answer lies in the services doing the sending -
    // e.g. S3 bucket notification configuration; SNS subscription.

    // Alas "scheduled" events are sent from the "events.amazonaws.com"
    // service, which is undocumented and has no API :-(

    return Q.all([
        functions,
        getAllPolicies,
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
