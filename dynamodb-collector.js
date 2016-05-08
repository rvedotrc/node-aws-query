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

var regions = require('./regions').regionsForService('dynamodb');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.DynamoDB(config));
};

var listTables = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("LastEvaluatedTableName", "ExclusiveStartTableName", "TableNames");
    return AwsDataUtils.collectFromAws(client, "listTables", {}, paginationHelper);
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var tableNames = client.then(listTables).then(AtomicFile.saveJsonTo("var/service/dynamodb/region/"+region+"/list-tables.json"));

    return Q.all([
        tableNames
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
