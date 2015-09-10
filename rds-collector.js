var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#rds_region
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
    return Q(new AWS.RDS(config));
};

var describeDBInstances = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "DBInstances");
    return AwsDataUtils.collectFromAws(client, "describeDBInstances", {}, paginationHelper)
        .then(function (r) {
            r.DBInstances.sort(function (a, b) {
                if (a.DBInstanceIdentifier < b.DBInstanceIdentifier) return -1;
                else if (a.DBInstanceIdentifier > b.DBInstanceIdentifier) return +1;
                else return 0;
            });
            // TODO, more sorting?
            // DBParameterGroups.DBParameterGroupName
            // DBSecurityGroups.DBSecurityGroupName
            // DBSubnetGroup.Subnets.SubnetIdentifier
            // OptionGroupMemberships.OptionGroupName
            // ...
            return r;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var ddi = client.then(describeDBInstances).then(AwsDataUtils.saveJsonTo("var/service/rds/region/"+region+"/describe-db-instances.json"));

    return Q.all([
        ddi,
        Q(true)
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
