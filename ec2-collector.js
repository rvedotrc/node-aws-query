var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AwsDataUtils = require('./aws-data-utils');

// https://docs.aws.amazon.com/general/latest/gr/rande.html#ec2_region
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
    return Q(new AWS.EC2(config));
};

var describeInstances = function (client) {
    return AwsDataUtils.collectFromAws(client, "EC2", "describeInstances", {}, "Reservations")
        .then(function (r) {
            r.Reservations.sort(function (a, b) {
                if (a.ReservationId < b.ReservationId) return -1;
                else if (a.ReservationId > b.ReservationId) return +1;
                else return 0;
            });
            for (var i=0; i<r.Reservations.length; ++i) {
                r.Reservations[i].Instances.sort(function (a, b) {
                    if (a.InstanceId < b.InstanceId) return -1;
                    else if (a.InstanceId > b.InstanceId) return +1;
                    else return 0;
                });
            }
            return r;
        });
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var di = client.then(describeInstances).then(AwsDataUtils.saveJsonTo("var/service/ec2/region/"+region+"/describe-instances.json"));

    return Q.all([
        di
    ]);
};

var collectAll = function (clientConfig) {
    var promises = [];

    for (var i=0; i<regions.length; ++i) {
        promises.push(collectAllForRegion(clientConfig, regions[i]));
    }

    return Q.all(promises);
};

module.exports = {
    collectAll: collectAll
};
