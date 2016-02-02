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

var AtomicFile = require('./atomic-file');
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
    "ap-northeast-2",
    "sa-east-1"
];

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.SNS(config));
};

var listTopics = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "Topics");

    return AwsDataUtils.collectFromAws(client, "listTopics", {}, paginationHelper)
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
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "Subscriptions");

    return AwsDataUtils.collectFromAws(client, "listSubscriptions", {}, paginationHelper)
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

    var topics = client.then(listTopics).then(AtomicFile.saveJsonTo("var/service/sns/region/"+region+"/list-topics.json"));
    var subs = client.then(listSubscriptions).then(AtomicFile.saveJsonTo("var/service/sns/region/"+region+"/list-subscriptions.json"));

    return Q.all([
        topics,
        subs
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
