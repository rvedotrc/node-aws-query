var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseSNS = function () {
    return Q(new AWS.SNS({ region: 'eu-west-1' }));
};

var listTopics = function (sns) {
    return AwsDataUtils.collectFromAws(sns, "SNS", "listTopics", [])
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Topics.sort(function (a, b) {
                if (a.TopicArn < b.TopicArn) return -1;
                else if (a.TopicArn > b.TopicArn) return +1;
                else return 0;
            });
            return r;
        });
};

var listSubscriptions = function (sns) {
    return AwsDataUtils.collectFromAws(sns, "SNS", "listSubscriptions", [])
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Subscriptions.sort(function (a, b) {
                if (a.TopicArn < b.TopicArn) return -1;
                else if (a.TopicArn > b.TopicArn) return +1;
                else if (a.Endpoint < b.Endpoint) return -1;
                else if (a.Endpoint > b.Endpoint) return +1;
                else if (a.SubscriptionArn < b.SubscriptionArn) return -1;
                else if (a.SubscriptionArn > b.SubscriptionArn) return +1;
                else return 0;
            });
            return r;
        });
};

var collectAll = function () {
    var sns = promiseSNS();

    var topics = sns.then(listTopics).then(AwsDataUtils.saveJsonTo("var/sns/list-topics.json"));
    var subs = sns.then(listSubscriptions).then(AwsDataUtils.saveJsonTo("var/sns/list-subscriptions.json"));

    return Q.all([
        topics,
        subs
    ]);
};

module.exports = {
    collectAll: collectAll
};
