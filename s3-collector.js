var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.S3({ region: 'eu-west-1' }));
};

var listBuckets = function (client) {
    // Data oddity: this data has {Owner: {DisplayName: x, ID: x}}
    return AwsDataUtils.collectFromAws(client, "S3", "listBuckets", [])
        .then(AwsDataUtils.tidyResponseMetadata)
        .then(function (r) {
            r.Buckets.sort(function (a, b) {
                if (a.Name < b.Name) return -1;
                else if (a.Name > b.Name) return +1;
                else return 0;
            });
            return r;
        });
};

var collectAll = function () {
    var client = promiseClient();

    var buckets = client.then(listBuckets).then(AwsDataUtils.saveJsonTo("var/s3/list-buckets.json"));

    return Q.all([
        buckets
    ]);
};

module.exports = {
    collectAll: collectAll
};
