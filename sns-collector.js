var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.SNS({ region: 'eu-west-1' }));
};

var listTopics = function (client) {
    return AwsDataUtils.collectFromAws(client, "SNS", "listTopics", {}, "Topics")
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

var listSubscriptions = function (client) {
    return AwsDataUtils.collectFromAws(client, "SNS", "listSubscriptions", {}, "Subscriptions")
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
    var client = promiseClient();

    var topics = client.then(listTopics).then(AwsDataUtils.saveJsonTo("var/service/sns/region/eu-west-1/list-topics.json"));
    var subs = client.then(listSubscriptions).then(AwsDataUtils.saveJsonTo("var/service/sns/region/eu-west-1/list-subscriptions.json"));

    return Q.all([
        topics,
        subs
    ]);
};

module.exports = {
    collectAll: collectAll
};
