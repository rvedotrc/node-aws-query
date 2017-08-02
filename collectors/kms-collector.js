/*
Copyright 2017 Rachel Evans

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

var regions = require('../regions').regionsForService('KMS');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.KMS(config));
};

var listAliases = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Aliases");

    return AwsDataUtils.collectFromAws(client, "listAliases", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Aliases.sort(function (a, b) {
                if (a.AliasArn < b.AliasArn) return -1;
                else if (a.AliasArn > b.AliasArn) return +1;
                else return 0;
            });
            return r;
        });
};

var listKeys = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Keys");

    return AwsDataUtils.collectFromAws(client, "listKeys", {}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Keys.sort(function (a, b) {
                if (a.KeyArn < b.KeyArn) return -1;
                else if (a.KeyArn > b.KeyArn) return +1;
                else return 0;
            });
            return r;
        });
};

var listGrants = function (client, key) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Grants");

    return AwsDataUtils.collectFromAws(client, "listGrants", {KeyId: key.KeyId}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Grants.sort(function (a, b) {
                if (a.GrantId < b.GrantId) return -1;
                else if (a.GrantId > b.GrantId) return +1;
                else return 0;
            });
            r.Grants.forEach(function (e) { e.Operations.sort(); });
            return r;
        });
};

var listKeyPolicies = function (client, key) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "PolicyNames");

    return AwsDataUtils.collectFromAws(client, "listKeyPolicies", {KeyId: key.KeyId}, paginationHelper)
        .then(function (r) {
            r.PolicyNames.sort();
            return Q.all(
                r.PolicyNames.map(function (policyName) {
                    return AwsDataUtils.collectFromAws(client, "getKeyPolicy", {KeyId: key.KeyId, PolicyName: policyName})
                        .then(function (pr) {
                            return { PolicyName: policyName, PolicyDocument: JSON.parse(pr.Policy) };
                        });
                })
            );
        });
};

var listResourceTags = function (client, key) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Tags");

    return AwsDataUtils.collectFromAws(client, "listResourceTags", {KeyId: key.KeyId}, paginationHelper)
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Tags.sort(function (a, b) {
                if (a.TagKey < b.TagKey) return -1;
                else if (a.TagKey > b.TagKey) return +1;
                else return 0;
            });
            return r;
        });
};

var getKey = function (client, region, key) {
    var keyDir = "service/kms/region/"+region+"/key/"+key.KeyId;

    var g = Q.all([ client, key ]).spread(listGrants).then(AtomicFile.saveJsonTo(keyDir+"/list-grants.json"));
    var p = Q.all([ client, key ]).spread(listKeyPolicies).then(AtomicFile.saveJsonTo(keyDir+"/policies.json"));
    var r = Q.all([ client, key ]).spread(listResourceTags).then(AtomicFile.saveJsonTo(keyDir+"/list-resource-tags.json"));

    return Q.all([ g, p, r ]);
};

var getAllKeys = function (client, region, keys) {
    return Q.all(
        keys.Keys.map(function (k) {
            return Q([ client, region, k ]).spread(getKey);
        })
    );
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var saveAliases = client.then(listAliases).then(AtomicFile.saveJsonTo("service/kms/region/"+region+"/list-aliases.json"));
    var keys = client.then(listKeys);
    var saveKeys = keys.then(AtomicFile.saveJsonTo("service/kms/region/"+region+"/list-keys.json"));
    var saveAllKeyInfo = Q.all([ client, region, keys ]).spread(getAllKeys);
    // listRetirableGrants ?

    return Q.all([
        saveAliases,
        saveKeys,
        saveAllKeyInfo,
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
