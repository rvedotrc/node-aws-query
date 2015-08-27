var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#sns_region
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
    return Q(new AWS.SNS(config));
};

var listTopics = function (client) {
    // pagination: NextToken
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
    // pagination: NextToken
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

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var topics = client.then(listTopics).then(AwsDataUtils.saveJsonTo("var/service/sns/region/"+region+"/list-topics.json"));
    var subs = client.then(listSubscriptions).then(AwsDataUtils.saveJsonTo("var/service/sns/region/"+region+"/list-subscriptions.json"));

    return Q.all([
        topics,
        subs
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
