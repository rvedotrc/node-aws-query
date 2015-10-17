var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

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

var doStack = function (client, region, stackName) {
    var d = Q(client)
        .then(function (cfn) { return AwsDataUtils.collectFromAws(cfn, "describeStacks", { StackName: stackName }); })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (s) {
            console.log(s);
            var d = s.Stacks[0];
            // FIXME if it's in one of these states, we need to detect this,
            // and succeed with zero assets.  This covers both collectAll and
            // collectOneStack.
            // FIXME if it's in *_IN_PROGRESS, we need to retry the whole of
            // doStack (not just this asset) a bit later.
            if (d.StackStatus.match(/^(CREATE_FAILED|DELETE_COMPLETE)$/)) {
                throw { code: "ValidationError", message: "Stack with id "+stackName+" does not exist" };
            }
            d.Capabilities.sort();
            d.Outputs.sort(comparator("OutputKey"));
            d.Parameters.sort(comparator("ParameterKey"));
            d.Tags.sort(comparator("Key"));
            return s;
        })
        .then(AtomicFile.saveJsonTo("var/service/cloudformation/region/"+region+"/stack/" + stackName + "/description.json"));

    var r = Q(client)
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

    var t = Q(client)
        .then(function (cfn) { return AwsDataUtils.collectFromAws(cfn, "getTemplate", { StackName: stackName }); })
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (d) { return JSON.parse(d.TemplateBody); })
        .then(AtomicFile.saveJsonTo("var/service/cloudformation/region/"+region+"/stack/" + stackName + "/template.json"));

    return Q.all([ d, r, t ]);
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

    return Q.all([ client, region, stackName ])
        .spread(doStack)
        .fail(function (e) {
            if (e.code === 'ValidationError' && e.message && e.message.match(/does not exist/)) {
                console.log("Swallowing 'stack does not exist' error:", e.message);
                return;
            }
            throw e;
        });
};

module.exports = {
    collectAll: collectAll,
    collectOneStack: collectOneStack,
};
