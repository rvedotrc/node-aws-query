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

var regions = require('../regions').regionsForService('ec2');

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

var describeSecurityGroups = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeSecurityGroups", {})
        .then(function (r) {
            r.SecurityGroups.sort(function (a, b) {
                if (a.GroupId < b.GroupId) return -1;
                else if (a.GroupId > b.GroupId) return +1;
                else return 0;
            });
            r.SecurityGroups.map(function (sg) {
                sg.Tags.sort(function (a, b) {
                    if (a.Key < b.Key) return -1;
                    if (a.Key > b.Key) return +1;
                    return 0;
                });
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

var describeKeyPairs = function (client) {
    return AwsDataUtils.collectFromAws(client, "describeKeyPairs", {});
};

var collectAllForRegion = function (clientConfig, region) {
    var client = promiseClient(clientConfig, region);

    var di = client.then(describeInstances).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-instances.json"));
    var da = client.then(describeAddresses).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-addresses.json"));
    var daa = client.then(describeAccountAttributes).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-account-attributes.json"));
    var daz = client.then(describeAvailabilityZones).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-availability-zones.json"));
    var dsg = client.then(describeSecurityGroups).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-security-groups.json"));
    var dv = client.then(describeVolumes).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-volumes.json"));
    var kp = client.then(describeKeyPairs).then(AtomicFile.saveJsonTo("service/ec2/region/"+region+"/describe-key-pairs.json"));
    // many, many more things that can be added...

    return Q.all([
        di,
        da,
        daa,
        daz,
        dsg,
        dv,
        kp,
        Q(true)
    ]);
};

var collectAll = function (clientConfig) {
    return Q.all(regions.map(function (r) { return collectAllForRegion(clientConfig, r); }));
};

module.exports = {
    collectAll: collectAll
};
