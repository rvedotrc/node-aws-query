var AWS = require('aws-sdk');
var Q = require('q');
var path = require('path');

var AwsDataUtils = require('./aws-data-utils');
var SqsListAllQueues = require('./sqs-list-all-queues');

var promiseClient = function () {
    return Q(new AWS.SQS({ region: 'eu-west-1' }));
};

var listAllQueues = function (client) {
    return SqsListAllQueues.listAllQueues(client);
};

var queueUrlsToNames = function(r) {
    var s = '';
    for (var i=0; i < r.QueueUrls.length; ++i) {
        s += path.basename(r.QueueUrls[i]) + "\n";
    }
    return s;
};

var getAllQueueAttributes = function(client, r) {
    var promises = [];
    for (var i=0; i < r.QueueUrls.length; ++i) {
        promises.push(
            Q([ client, r.QueueUrls[i] ]).spread(getQueueAttributes)
        );
    }
    return Q.all(promises);
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

var getQueueAttributes = function(client, url) {
    return AwsDataUtils.collectFromAws(client, "SQS", "getQueueAttributes", {QueueUrl: url, AttributeNames: attributesToCollect})
        .then(function (r) {
            var queueName = path.basename(url);
            // Change from ruby code: decode policies inline, no separate asset
            var saveAttrs = Q(r.Attributes)
                .then(AwsDataUtils.decodeJsonInline("Policy"))
                .then(AwsDataUtils.decodeJsonInline("RedrivePolicy"))
                .then(AwsDataUtils.saveJsonTo("var/service/sqs/region/eu-west-1/queue/"+queueName+"/attributes.json"));
            return saveAttrs;
        });
};

var collectAll = function () {
    var client = promiseClient();

    var queueUrls = client.then(listAllQueues).then(AwsDataUtils.saveJsonTo("var/service/sqs/region/eu-west-1/list-all-queues.json"));
    var queueNames = queueUrls.then(queueUrlsToNames).then(AwsDataUtils.saveContentTo("var/service/sqs/region/eu-west-1/list-all-queues.txt"));
    var queueAttrs = Q.all([ client, queueUrls ]).spread(getAllQueueAttributes);

    return Q.all([
        queueUrls,
        queueNames,
        queueAttrs
    ]);
};

module.exports = {
    collectAll: collectAll
};
