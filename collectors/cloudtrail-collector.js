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

var regions = require('../regions').regionsForService('CloudTrail');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.CloudTrail(config));
};

var describeTrails = function (client) {
    return(AwsDataUtils.collectFromAws(client, "describeTrails", {})
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.trailList.sort(function (a, b) {
                if (a.TrailArn < b.TrailArn) return -1;
                else if (a.TrailArn > b.TrailArn) return +1;
                else return 0;
            });
            return r;
        })
    );
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var alarms = client.then(describeTrails).then(AtomicFile.saveJsonTo("service/cloudtrail/region/"+region+"/describe-trails.json"));

    return Q.all([
        alarms
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
