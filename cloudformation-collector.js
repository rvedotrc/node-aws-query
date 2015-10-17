var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');
var rimraf = require('rimraf');

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#cfn_region
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
            console.log(s);
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
        .then(AtomicFile.saveJsonTo("var/service/cloudformation/region/"+region+"/stack/" + stackName + "/description.json"));
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
        .then(AtomicFile.saveJsonTo("var/service/cloudformation/region/"+region+"/stack/" + stackName + "/resources.json"));
};

var doStackTemplate = function (client, region, stackName) {
    return Q(client)
        .then(function (cfn) { return AwsDataUtils.collectFromAws(cfn, "getTemplate", { StackName: stackName }); })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (d) { return JSON.parse(d.TemplateBody); })
        .then(AtomicFile.saveJsonTo("var/service/cloudformation/region/"+region+"/stack/" + stackName + "/template.json"));
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
                return Q.nfcall(rimraf, "var/service/cloudformation/region/"+region+"/stack/" + stackName);
            } else if (e.code === 'StackInProgress') {
                console.log("Stack", stack, "in", region, "is not at rest.  Waiting 10s and trying again.");
                return Q.delay(10000).then(function () {
                    return Q.all([ client, region, stackName ]).spread(doStack);
                });
            } else {
                throw e;
            }
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var stacks = client
        .then(function (cfn) {
            var p = AwsDataUtils.paginationHelper("NextToken", "NextToken", "Stacks");
            return AwsDataUtils.collectFromAws(cfn, "describeStacks", {}, p);
        })
        .then(AwsDataUtils.tidyResponseMetadata);

    return stacks
        .then(function (s) {
            return Q.all(
                s.Stacks.map(function (sd) {
                    return Q.all([ client, region, sd.StackName ]).spread(doStack);
                })
            );
        });
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
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
