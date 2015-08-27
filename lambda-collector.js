var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#lambda_region
var regions = [
    "us-east-1",
    "us-west-2",
    "eu-west-1",
    "ap-northeast-1"
];

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.Lambda(config));
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

    var functions = client.then(listFunctions).then(AwsDataUtils.saveJsonTo("var/service/lambda/region/"+region+"/list-functions.json"));

    return Q.all([
        functions
    ]);
};

var collectAll = function (clientConfig) {
    var promises = [];

    for (var i=0; i<regions.length; ++i) {
        promises.push(collectAllForRegion(clientConfig, regions[i]));
    }

    return Q.all(promises);
};

module.exports = {
    collectAll: collectAll
};
