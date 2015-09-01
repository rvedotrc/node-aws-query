var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');
var path = require('path');

var AwsDataUtils = require('./aws-data-utils');
var SqsListAllQueues = require('./sqs-list-all-queues');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#sqs_region
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
    return Q(new AWS.SQS(config));
};

var listAllQueues = function (client) {
    return SqsListAllQueues.listAllQueues(client);
};

var queueUrlsToNames = function(r) {
    return r.QueueUrls.map(function (url) { return path.basename(url) + "\n"; }).join("");
};

var getAllQueueAttributes = function(client, region, r) {
    return Q.all(
        r.QueueUrls.map(function (url) {
            return Q([ client, region, url ]).spread(getQueueAttributes);
        })
    );
};

var attributesToCollect = [
    "Policy",
    "VisibilityTimeout",
    "MaximumMessageSize",
    "MessageRetentionPeriod",
    "CreatedTimestamp",
    "LastModifiedTimestamp",
    "QueueArn",
    "DelaySeconds",
    "ReceiveMessageWaitTimeSeconds",
    "RedrivePolicy"
];

var getQueueAttributes = function(client, region, url) {
    return AwsDataUtils.collectFromAws(client, "getQueueAttributes", {QueueUrl: url, AttributeNames: attributesToCollect})
        .then(function (r) {
            var queueName = path.basename(url);
            // Change from ruby code: decode policies inline, no separate asset
            var saveAttrs = Q(r.Attributes)
                .then(AwsDataUtils.decodeJsonInline("Policy"))
                .then(AwsDataUtils.decodeJsonInline("RedrivePolicy"))
                .then(AwsDataUtils.saveJsonTo("var/service/sqs/region/"+region+"/queue/"+queueName+"/attributes.json"));
            return saveAttrs;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var queueUrls = client.then(listAllQueues).then(AwsDataUtils.saveJsonTo("var/service/sqs/region/"+region+"/list-all-queues.json"));
    var queueNames = queueUrls.then(queueUrlsToNames).then(AwsDataUtils.saveContentTo("var/service/sqs/region/"+region+"/list-all-queues.txt"));
    var queueAttrs = Q.all([ client, region, queueUrls ]).spread(getAllQueueAttributes);

    return Q.all([
        queueUrls,
        queueNames,
        queueAttrs
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
