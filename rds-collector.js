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

var regions = require('./regions').regionsForService('rds');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.RDS(config));
};

var describeDBInstances = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "DBInstances");
    return AwsDataUtils.collectFromAws(client, "describeDBInstances", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.DBInstances.sort(function (a, b) {
                if (a.DBInstanceIdentifier < b.DBInstanceIdentifier) return -1;
                else if (a.DBInstanceIdentifier > b.DBInstanceIdentifier) return +1;
                else return 0;
            });
            // TODO, more sorting?
            // DBParameterGroups.DBParameterGroupName
            // DBSecurityGroups.DBSecurityGroupName
            // DBSubnetGroup.Subnets.SubnetIdentifier
            // OptionGroupMemberships.OptionGroupName
            // ...
            return r;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var ddi = client.then(describeDBInstances).then(AtomicFile.saveJsonTo("var/service/rds/region/"+region+"/describe-db-instances.json"));

    return Q.all([
        ddi,
        Q(true)
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
