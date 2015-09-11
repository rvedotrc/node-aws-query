var AWS = require('aws-sdk');
var Q = require('q');
var merge = require('merge');

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function (clientConfig) {
    return Q(new AWS.Route53(clientConfig));
};

var compareZones = function (a, b) {
    var ax = a.split('.').reverse().join('\0');
    var bx = b.split('.').reverse().join('\0');
    if (ax < bx) return -1;
    else if (ax > bx) return +1;
    else return 0;
};

var listHostedZones = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "HostedZones");
    return AwsDataUtils.collectFromAws(client, "listHostedZones", {}, paginationHelper)
        .then(function (r) {
            r.HostedZones.sort(function (a, b) {
                return compareZones(a.Name, b.Name);
            });
            return r;
        });
};

var collectAll = function (clientConfig) {
    var client = promiseClient(clientConfig);

    var lhz = client.then(listHostedZones).then(AtomicFile.saveJsonTo("var/service/route53/list-hosted-zones.json"));

    return Q.all([
        lhz,
        Q(true)
    ]);
};

module.exports = {
    collectAll: collectAll
};
