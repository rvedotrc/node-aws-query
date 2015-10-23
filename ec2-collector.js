var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
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
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "Reservations");

    return AwsDataUtils.collectFromAws(client, "describeInstances", {}, paginationHelper)
        .then(function (r) {
            r.Reservations.sort(function (a, b) {
                if (a.ReservationId < b.ReservationId) return -1;
                else if (a.ReservationId > b.ReservationId) return +1;
                else return 0;
            });
            r.Reservations.forEach(function (res) {
                res.Instances.sort(function (a, b) {
                    if (a.InstanceId < b.InstanceId) return -1;
                    else if (a.InstanceId > b.InstanceId) return +1;
                    else return 0;
                });
            });
            return r;
        });
};

var describeAddresses = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeAddresses")
        .then(function (r) {
            r.Addresses.sort(function (a, b) {
                if (a.PublicIp < b.PublicIp) return -1;
                else if (a.PublicIp > b.PublicIp) return +1;
                else return 0;
            });
            return r;
        });
};

var describeAccountAttributes = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeAccountAttributes")
        .then(function (r) {
            // Tempting to turn { AttributeName, AttributeValue } into an actual map
            r.AccountAttributes.sort(function (a, b) {
                if (a.AttributeName < b.AttributeName) return -1;
                else if (a.AttributeName > b.AttributeName) return +1;
                else return 0;
            });
            return r;
        });
};

var describeAvailabilityZones = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeAvailabilityZones")
        .then(function (r) {
            // Tempting to turn { AttributeName, AttributeValue } into an actual map
            r.AvailabilityZones.sort(function (a, b) {
                if (a.ZoneName < b.ZoneName) return -1;
                else if (a.ZoneName > b.ZoneName) return +1;
                else return 0;
            });
            return r;
        });
};

var describeVolumes = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("NextToken", "NextToken", "Volumes");

    return AwsDataUtils.collectFromAws(client, "describeVolumes", {}, paginationHelper)
        .then(function (r) {
            r.Volumes.sort(function (a, b) {
                if (a.VolumeId < b.VolumeId) return -1;
                else if (a.VolumeId > b.VolumeId) return +1;
                else return 0;
            });
            r.Volumes.map(function (v) {
                v.Tags.sort(function (a, b) {
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

    var di = client.then(describeInstances).then(AtomicFile.saveJsonTo("var/service/ec2/region/"+region+"/describe-instances.json"));
    var da = client.then(describeAddresses).then(AtomicFile.saveJsonTo("var/service/ec2/region/"+region+"/describe-addresses.json"));
    var daa = client.then(describeAccountAttributes).then(AtomicFile.saveJsonTo("var/service/ec2/region/"+region+"/describe-account-attributes.json"));
    var daz = client.then(describeAvailabilityZones).then(AtomicFile.saveJsonTo("var/service/ec2/region/"+region+"/describe-availability-zones.json"));
    var dv = client.then(describeVolumes).then(AtomicFile.saveJsonTo("var/service/ec2/region/"+region+"/describe-volumes.json"));
    // many, many more things that can be added...

    return Q.all([
        di,
        da,
        daa,
        daz,
        dv,
        Q(true)
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
