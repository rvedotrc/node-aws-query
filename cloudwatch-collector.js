var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#cw_region
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
    return Q(new AWS.CloudWatch(config));
};

var describeAlarms = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "MetricAlarms");

    return(AwsDataUtils.collectFromAws(client, "describeAlarms", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.MetricAlarms.sort(function (a, b) {
                if (a.AlarmArn < b.AlarmArn) return -1;
                else if (a.AlarmArn > b.AlarmArn) return +1;
                else return 0;
            });
            r.MetricAlarms.forEach(function (ele) {
                if (ele.StateReasonData !== undefined) {
                    ele.StateReasonData = JSON.parse(ele.StateReasonData);
                }
            });
            return r;
        })
    );
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var alarms = client.then(describeAlarms).then(AtomicFile.saveJsonTo("var/service/cloudwatch/region/"+region+"/describe-alarms.json"));

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
