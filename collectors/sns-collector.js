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

var AtomicFile = require('../util/atomic-file');
var AwsDataUtils = require('../util/aws-data-utils');

var regions = require('../regions').regionsForService('SNS');

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

var getAttributesForTopic = function (client, region, topicArn) {
    var topicName = topicArn.split(/:/)[5];

    return AwsDataUtils.collectFromAws(client, "getTopicAttributes", { TopicArn: topicArn })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) { return r.Attributes; })
        .then(AwsDataUtils.decodeJsonInline("Policy"))
        .then(AwsDataUtils.decodeJsonInline("EffectiveDeliveryPolicy"))
        .then(AtomicFile.saveJsonTo("service/sns/region/"+region+"/topic/" + topicName + "/attributes.json"));
};

var getAttributesForAllTopics = function (client, region, topics) {
    return Q.all(
        topics.Topics.map(function (t) {
            return Q([ client, region, t.TopicArn ]).spread(getAttributesForTopic);
        })
    );
};

var getAttributesForSubscription = function (client, region, subscriptionArn) {
    return AwsDataUtils.collectFromAws(client, "getSubscriptionAttributes", { SubscriptionArn: subscriptionArn })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) { return r.Attributes; })
        .then(AwsDataUtils.decodeJsonInline("DeliveryPolicy"))
        .then(AwsDataUtils.decodeJsonInline("EffectiveDeliveryPolicy"))
        .then(AtomicFile.saveJsonTo("service/sns/region/"+region+"/subscription/" + subscriptionArn + "/attributes.json"));
};

var getAttributesForAllSubscriptions = function (client, region, subscriptions) {
    return Q.all(
        subscriptions.Subscriptions.map(function (s) {
            return Q([ client, region, s.SubscriptionArn ]).spread(getAttributesForSubscription);
        })
    );
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var topics = client.then(listTopics).then(AtomicFile.saveJsonTo("service/sns/region/"+region+"/list-topics.json"));
    var subs = client.then(listSubscriptions);
    var saveSubs = subs.then(AtomicFile.saveJsonTo("service/sns/region/"+region+"/list-subscriptions.json"));
    var subAttrs = Q.all([ client, region, subs ]).spread(getAttributesForAllSubscriptions);
    var attrs = Q.all([ client, region, topics ]).spread(getAttributesForAllTopics);

    return Q.all([
        topics,
        saveSubs,
        subAttrs,
        attrs,
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
