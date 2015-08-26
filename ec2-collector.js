var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseEC2 = function () {
    return Q(new AWS.EC2({ region: 'eu-west-1' }));
};

var describeInstances = function (ec2) {
    return AwsDataUtils.collectFromAws(ec2, "EC2", "describeInstances", {}, "Reservations")
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

var collectAll = function () {
    var ec2 = promiseEC2();

    var di = ec2.then(describeInstances).then(AwsDataUtils.saveJsonTo("var/service/ec2/region/eu-west-1/describe-instances.json"));

    return Q.all([
        di
    ]);
};

module.exports = {
    collectAll: collectAll
};
