var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

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
    "sa-east-1"
];

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.CloudWatch(config));
};

var describeInstances = function (client) {
    // pagination: NextToken / ?
    return(AwsDataUtils.collectFromAws(client, "CloudWatch", "describeAlarms", {}, "MetricAlarms")
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.MetricAlarms.sort(function (a, b) {
                if (a.AlarmArn < b.AlarmArn) return -1;
                else if (a.AlarmArn > b.AlarmArn) return +1;
                else return 0;
            });
            for (var i=0; i<r.MetricAlarms.length; ++i) {
                if (r.MetricAlarms[i].StateReasonData !== undefined) {
                    r.MetricAlarms[i].StateReasonData = JSON.parse(r.MetricAlarms[i].StateReasonData);
                }
            }
            return r;
        })
    );
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var alarms = client.then(describeInstances).then(AwsDataUtils.saveJsonTo("var/service/cloudwatch/region/"+region+"/describe-alarms.json"));

    return Q.all([
        alarms
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
