/*
Copyright 2016 Rachel Evans

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');
var path = require('path');

var AtomicFile = require('../util/atomic-file');
var AwsDataUtils = require('../util/aws-data-utils');
var SqsListAllQueues = require('../util/sqs-list-all-queues');

var regions = require('../regions').regionsForService('sqs');

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
                .then(AtomicFile.saveJsonTo("var/service/sqs/region/"+region+"/queue/"+queueName+"/attributes.json"));
            return saveAttrs;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var queueUrls = client.then(listAllQueues).then(AtomicFile.saveJsonTo("var/service/sqs/region/"+region+"/list-all-queues.json"));
    var queueNames = queueUrls.then(queueUrlsToNames).then(AtomicFile.saveContentTo("var/service/sqs/region/"+region+"/list-all-queues.txt"));
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
