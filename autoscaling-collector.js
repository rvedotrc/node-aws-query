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

// https://docs.aws.amazon.com/general/latest/gr/rande.html#as_region
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
    return Q(new AWS.AutoScaling(config));
};

// describeAccountLimits
// describeAdjustmentTypes
// describeAutoScalingGroups
// describeAutoScalingInstances
// describeAutoScalingNotificationTypes
// describeLaunchConfigurations
// describeLifecycleHooks
// describeLifecycleHookTypes
// describeLoadBalancers
// describeMetricCollectionTypes
// describeNotificationConfigurations
// describePolicies
// describeScalingActivities
// describeScalingProcessTypes
// describeScheduledActions
// describeTags
// describeTerminationPolicyTypes

var describeAccountLimits = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeAccountLimits")
        .then(AwsDataUtils.tidyResponseMetadata);
};

var describeAutoScalingGroups = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "AutoScalingGroups");

    return AwsDataUtils.collectFromAws(client, "describeAutoScalingGroups", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.AutoScalingGroups.sort(function (a, b) {
                if (a.AutoScalingGroupName < b.AutoScalingGroupName) return -1;
                else if (a.AutoScalingGroupName > b.AutoScalingGroupName) return +1;
                else return 0;
            });
            r.AutoScalingGroups.map(function (asg) {
                asg.Instances.sort(function (a, b) {
                    if (a.InstanceId < b.InstanceId) return -1;
                    if (a.InstanceId > b.InstanceId) return +1;
                    return 0;
                });
                asg.Tags.sort(function (a, b) {
                    if (a.Key < b.Key) return -1;
                    if (a.Key > b.Key) return +1;
                    return 0;
                });
            });
            return r;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var p_describeAccountLimits = client.then(describeAccountLimits).then(AtomicFile.saveJsonTo("var/service/autoscaling/region/"+region+"/describe-account-limits.json"));
    var p_describeAutoScalingGroups = client.then(describeAutoScalingGroups).then(AtomicFile.saveJsonTo("var/service/autoscaling/region/"+region+"/describe-autoscaling-groups.json"));
    // many, many more things that can be added...

    return Q.all([
        p_describeAccountLimits,
        p_describeAutoScalingGroups,
        Q(true)
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
