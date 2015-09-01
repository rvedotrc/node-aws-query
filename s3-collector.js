var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.S3({ region: 'eu-west-1' }));
};

var getLocationForBucket = function (client, bucketName) {
    return AwsDataUtils.collectFromAws(client, "getBucketLocation", {Bucket: bucketName})
        .then(function (r) {
            console.log("location for", bucketName, "is", r.LocationConstraint);
            return r.LocationConstraint;
        });
};

var getClientForLocation = function (loc) {
    if (loc === 'EU') loc = 'eu-west-1';
    return Q(new AWS.S3({ region: loc }));
};

var listBuckets = function (client) {
    // Data oddity: this data has {Owner: {DisplayName: x, ID: x}}
    return AwsDataUtils.collectFromAws(client, "listBuckets")
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

var collectBucketDetails = function (client, r) {
    // XXX allow some to fail e.g. due to 403
    return Q.allSettled(
        r.Buckets.map(function (b) {
            return Q([ client, b.Name ]).spread(getBucketDetails);
        })
    );
};

var getBucketData = function (client, loc, bucketName, method, processor, filename) {
    if (loc === null) {
        loc = "standard";
    } else if (loc === "EU") {
        loc = "eu-west-1";
    }

    var asset = "var/service/s3/location/"+loc+"/bucket/"+bucketName+"/"+filename;

    var p = AwsDataUtils.collectFromAws(client, method, {Bucket: bucketName})
        .then(AwsDataUtils.tidyResponseMetadata);

    if (processor) {
        p = p.then(processor);
    }

    return p.then(AwsDataUtils.saveJsonTo(asset))
        .fail(function (e) {
            if (e.statusCode === 404) {
                return AwsDataUtils.deleteAsset(asset);
            } else {
                throw e;
            }
        });
};

var fetchBucketAcl = function (client, loc, bucketName) {
    var processor = function (r) {
        r.Grants.sort(function (a, b) {
            if (a.Grantee.ID < b.Grantee.ID) return -1;
            else if (a.Grantee.ID > b.Grantee.ID) return +1;
            if (a.Permission < b.Permission) return -1;
            else if (a.Permission > b.Permission) return +1;
            else return 0;
        });
        return r;
    };
    return getBucketData(client, loc, bucketName, "getBucketAcl", processor, "acl.json");
};

var fetchBucketLifecycle = function (client, loc, bucketName) {
    var processor = function (r) {
        r.Rules.sort(function (a, b) {
            if (a.ID < b.ID) return -1;
            else if (a.ID > b.ID) return +1;
            if (a.Prefix < b.Prefix) return -1;
            else if (a.Prefix > b.Prefix) return +1;
            else return 0;
        });
        return r;
    };
    return getBucketData(client, loc, bucketName, "getBucketLifecycle", processor, "lifecycle.json");
};

var fetchBucketLogging = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketLogging", null, "logging.json");
};

var fetchBucketPolicy = function (client, loc, bucketName) {
    // Policy decoding: not compatible with the old ruby code.  Here, we
    // decode inline.  The ruby version created a separate asset.
    return getBucketData(client, loc, bucketName, "getBucketPolicy", AwsDataUtils.decodeJsonInline("Policy"), "policy.json");
};

var fetchBucketTagging = function (client, loc, bucketName) {
    var processor = function (r) {
        r.TagSet.sort(function (a, b) {
            if (a.Key.toLowerCase() < b.Key.toLowerCase()) return -1;
            else if (a.Key.toLowerCase() > b.Key.toLowerCase()) return +1;
            else return 0;
        });
        return r;
    };
    return getBucketData(client, loc, bucketName, "getBucketTagging", processor, "tags.json");
};

var getBucketDetails = function (client, bucketName) {
    var locationForBucket = getLocationForBucket(client, bucketName);
    var clientForBucket = locationForBucket.then(getClientForLocation);
    var args = Q([ clientForBucket, locationForBucket, bucketName ]);
    return Q.all([
        args.spread(fetchBucketAcl),
        args.spread(fetchBucketLifecycle),
        args.spread(fetchBucketLogging),
        args.spread(fetchBucketPolicy),
        args.spread(fetchBucketTagging)
    ]);
};

var collectAll = function () {
    var client = promiseClient();

    var buckets = client.then(listBuckets).then(AwsDataUtils.saveJsonTo("var/service/s3/list-buckets.json"));
    var bucketDetails = Q.all([ client, buckets ]).spread(collectBucketDetails);

    return Q.all([
        buckets,
        bucketDetails
    ]);
};

module.exports = {
    collectAll: collectAll
};
