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

var regions = require('../regions').regionsForService('CloudWatchEvents');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.CloudWatchEvents(config));
};

var listRules = function (client) {
    return AwsDataUtils.collectFromAws(client, "listRules", {})
        .then(AwsDataUtils.tidyResponseMetadata);
};

var annotateRuleWithTargets = function (client, rule) {
    return AwsDataUtils.collectFromAws(client, "listTargetsByRule", { Rule: rule.Name })
        .then(function (r) {
            rule.Targets = r.Targets;
            return rule;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var rules = client.then(listRules)
        .then(function (r) {
            return Q.all(
                r.Rules.map(function (rule) {
                    return Q([ client, rule ]).spread(annotateRuleWithTargets);
                })
            );
        })
        .then(AtomicFile.saveJsonTo("service/events/region/"+region+"/list-rules.json"));

    return rules;
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
