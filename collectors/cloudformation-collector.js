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
var fs = require('fs');
var merge = require('merge');
var rimraf = require('rimraf');

var AtomicFile = require('../util/atomic-file');
var AwsDataUtils = require('../util/aws-data-utils');

var regions = require('../regions').regionsForService('cloudformation');

var promiseClient = function (clientConfig, region) {
    var config = merge(clientConfig, { region: region });
    return Q(new AWS.CloudFormation(config));
};

var comparator = function (k) {
    return function (x, y) {
        if (x[k] < y[k]) return -1;
        if (x[k] > y[k]) return +1;
        return 0;
    };
};

var doStackDescription = function (client, region, stackName) {
    return Q(client)
        .then(function (cfn) { return AwsDataUtils.collectFromAws(cfn, "describeStacks", { StackName: stackName }); })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (s) {
            var d = s.Stacks[0];
            if (d.StackStatus.match(/^(CREATE_FAILED|DELETE_COMPLETE)$/)) {
                throw { code: "StackDoesNotExist" };
            } else if (d.StackStatus.match(/.*_IN_PROGRESS$/)) {
                throw { code: "StackInProgress" };
            }
            d.Capabilities.sort();
            d.Outputs.sort(comparator("OutputKey"));
            d.Parameters.sort(comparator("ParameterKey"));
            d.Tags.sort(comparator("Key"));
            return s;
        })
        .then(AtomicFile.saveJsonTo("service/cloudformation/region/"+region+"/stack/" + stackName + "/description.json"));
};

var doStackResources = function (client, region, stackName) {
    return Q(client)
        .then(function (cfn) {
            var p = AwsDataUtils.paginationHelper("NextToken", "NextToken", "StackResourceSummaries");
            return AwsDataUtils.collectFromAws(cfn, "listStackResources", { StackName: stackName }, p);
        })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (d) {
            // Seems to be sorted this way already, but not documented.
            d.StackResourceSummaries.sort(comparator("LogicalResourceId"));
            return d;
        })
        .then(AtomicFile.saveJsonTo("service/cloudformation/region/"+region+"/stack/" + stackName + "/resources.json"));
};

var doStackTemplate = function (client, region, stackName) {
    return Q(client)
        .then(function (cfn) { return AwsDataUtils.collectFromAws(cfn, "getTemplate", { StackName: stackName }); })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (d) { return JSON.parse(d.TemplateBody); })
        .then(AtomicFile.saveJsonTo("service/cloudformation/region/"+region+"/stack/" + stackName + "/template.json"));
};

var doStack = function (client, region, stackName) {
    var d = doStackDescription(client, region, stackName);
    var r = doStackResources(client, region, stackName);
    var t = doStackTemplate(client, region, stackName);

    return Q.all([ d, r, t ])
        .fail(function (e) {
            if (e.code === 'StackDoesNotExist' || (e.code === 'ValidationError' && e.message && e.message.match(/^Stack.*does not exist/))) {
                // Just in case.
                console.log("No such stack", stackName, "in", region);
                return Q.allSettled([ d, r, t ]).then(function () {
                    return Q.nfcall(rimraf, "service/cloudformation/region/"+region+"/stack/" + stackName);
                });
            } else if (e.code === 'StackInProgress') {
                console.log("Stack", stackName, "in", region, "is not at rest.  Waiting 10s and trying again.");
                return Q.delay(10000).then(function () {
                    return Q.all([ client, region, stackName ]).spread(doStack);
                });
            } else {
                throw e;
            }
        });
};

var convertTimestamp = function (t) {
    if (!t) return t;
    if (t.getTime) return t.getTime();
    var ms = Date.parse(t);
    if (!ms) throw "Failed to parse date string: " + t;
    return ms;
};

var descriptionMatchesSummary = function (description, summary) {
    if (!description) return false;
    if (description.Stacks[0].StackId !== summary.StackId) return false;
    if (description.Stacks[0].StackStatus !== summary.StackStatus) return false;
    if (convertTimestamp(description.Stacks[0].LastUpdatedTime) !== convertTimestamp(summary.LastUpdatedTime)) return false;
    return true;
};

var conditionallyUpdateStack = function (client, region, summary) {
    return Q.nfcall(fs.readFile, "service/cloudformation/region/"+region+"/stack/" + summary.StackName + "/description.json")
        .then(JSON.parse, function (e) {
            if (e.code === 'ENOENT') return null;
            throw e;
        })
        .then(function (d) {
            if (descriptionMatchesSummary(d, summary)) {
                // console.log("No update required for", summary.StackName);
            } else {
                console.log("Update required for", summary.StackName);
                // console.log("  ", d ? d.Stacks[0] : null);
                // console.log("  ", summary);
                return doStack(client, region, summary.StackName);
            }
        });
};

// Documentation is unclear whether or not this is exhaustive
var interestingStackStatuses = [
    "CREATE_IN_PROGRESS",
    // "CREATE_FAILED",
    "CREATE_COMPLETE",
    "ROLLBACK_IN_PROGRESS",
    "ROLLBACK_FAILED",
    "ROLLBACK_COMPLETE",
    "DELETE_IN_PROGRESS",
    "DELETE_FAILED",
    // "DELETE_COMPLETE",
    "UPDATE_IN_PROGRESS",
    "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
    "UPDATE_COMPLETE",
    "UPDATE_ROLLBACK_IN_PROGRESS",
    "UPDATE_ROLLBACK_FAILED",
    "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
    "UPDATE_ROLLBACK_COMPLETE",
];

var collectAllForRegion = function (clientConfig, region, exhaustive) {
    var client = promiseClient(clientConfig, region);

    var allStackNames = {};
    Object.setPrototypeOf(allStackNames, null);

    var nullPaginator = {
        nextArgs: function () {}
    };

    var params = {};
    if (!exhaustive) {
        params.StackStatusFilter = interestingStackStatuses;
    }

    var doPage = function (cfn, args) {
        return AwsDataUtils.collectFromAws(cfn, "listStacks", args, nullPaginator)
            .then(function (r) {
                // console.log("Got a page of results for", r.StackSummaries.map(function (s) { return s.StackName; }));

                // Return promises of: processing stable stacks; polling
                // unstable stacks; and querying the next page, if any.
                var promises = [];

                r.StackSummaries.map(function (summary) {
                    if (summary.StackStatus === "CREATE_FAILED" || summary.StackStatus === "DELETE_COMPLETE") return;

                    // We now have a possibly-unstable stack summary
                    if (summary.StackStatus.match(/.*IN_PROGRESS$/)) {
                        console.log("Polling unstable stack", summary.StackName);
                        promises.push(
                            Q.all([ client, region, summary.StackName ]).delay(10000).spread(doStack)
                        );
                    } else {
                        // console.log("Found stable stack", summary.StackName, JSON.stringify(summary));
                        allStackNames[summary.StackName] = true;
                        promises.push(
                            conditionallyUpdateStack(client, region, summary)
                        );
                    }
                });

                if (r.NextToken) {
                    // console.log("Promising next page");
                    promises.push(doPage(cfn, merge(true, args, { NextToken: r.NextToken })));
                }

                return Q.all(promises);
            });
    };

    return Q.all([ client, Q(params) ]).spread(doPage)
        .then(function () {
            console.log("All stacks in", region, "enumerated");
            return deleteOtherSubdirs("service/cloudformation/region/"+region+"/stack", allStackNames);
        });
};

var deleteOtherSubdirs = function (stacksDir, allStackNames) {
    return Q.nfcall(fs.readdir, stacksDir)
        .then(function (childDirs) {
            var toDelete = childDirs.filter(function (n) { return !allStackNames[n]; });
            if (toDelete.length > 0) {
                console.log("Deleting", toDelete, "from", stacksDir);
                return Q.all(
                    toDelete.map(function (stackName) {
                        return Q.nfcall(rimraf, stacksDir + "/" + stackName);
                    })
                );
            }
        }, function (e) {
            if (e.code === 'ENOENT') return;
            console.log(e);
            throw e;
        });
};

var collectAll = function (clientConfig, exhaustive) {
    AwsDataUtils.setConcurrency(2);
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r, exhaustive); }));
};

var collectOneStack = function (clientConfig, stack) {
    var m = stack.match(/^arn:aws:cloudformation:(.*?):(\d+):stack\/(.*?)(\/.*)?$/);
    if (!m) {
        throw "--stack should specify a CloudFormation stack arn";
    }

    var region = m[1];
    var stackName = m[3];

    var client = promiseClient(clientConfig, region);

    return Q.all([ client, region, stackName ]).spread(doStack);
};

module.exports = {
    collectAll: collectAll,
    collectOneStack: collectOneStack,
};
