var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.CloudWatch({ region: 'eu-west-1' }));
};

var describeInstances = function (client) {
    return(AwsDataUtils.collectFromAws(client, "CloudWatch", "describeAlarms", [])
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

var collectAll = function () {
    var client = promiseClient();

    var alarms = client.then(describeInstances).then(AwsDataUtils.saveJsonTo("var/cloudwatch/describe-alarms.json"));

    return Q.all([
        alarms
    ]);
};

module.exports = {
    collectAll: collectAll
};
