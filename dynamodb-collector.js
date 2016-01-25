var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#ddb_region
var regions = [
    "us-east-1",
    "us-west-2",
    "us-west-1",
    "eu-west-1",
    "eu-central-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ap-northeast-2",
    "sa-east-1"
];

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
