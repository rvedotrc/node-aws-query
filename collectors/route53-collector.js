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

var AtomicFile = require('../util/atomic-file');
var AwsDataUtils = require('../util/aws-data-utils');

var promiseClient = function (clientConfig) {
    return Q(new AWS.Route53(clientConfig));
};

var compareZones = function (a, b) {
    var ax = a.split('.').reverse().join('\0');
    var bx = b.split('.').reverse().join('\0');
    if (ax < bx) return -1;
    else if (ax > bx) return +1;
    else return 0;
};

var listHostedZones = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "HostedZones");
    return AwsDataUtils.collectFromAws(client, "listHostedZones", {}, paginationHelper)
        .then(function (r) {
            r.HostedZones.sort(function (a, b) {
                return compareZones(a.Name, b.Name);
            });
            return r;
        });
};

var collectAll = function (clientConfig) {
    var client = promiseClient(clientConfig);

    var lhz = client.then(listHostedZones).then(AtomicFile.saveJsonTo("service/route53/list-hosted-zones.json"));

    return Q.all([
        lhz,
        Q(true)
    ]);
};

module.exports = {
    collectAll: collectAll
};
