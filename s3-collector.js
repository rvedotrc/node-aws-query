var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.S3({ region: 'eu-west-1' }));
};

var getClientForBucket = function (client, bucketName) {
    return AwsDataUtils.collectFromAws(client, "S3", "getBucketLocation", [{Bucket: bucketName}])
        .then(function (r) {
            var loc = r.LocationConstraint;
            console.log("location for", bucketName, "is", loc);
            if (loc === 'EU') loc = 'eu-west-1';
            return Q(new AWS.S3({ region: loc }));
        });
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

var collectBucketDetails = function (client, r) {
    var promises = [];
    for (var i=0; i < r.Buckets.length; ++i) {
        promises.push(
            Q([ client, r.Buckets[i].Name ]).spread(getBucketDetails)
        );
    }
    return Q.all(promises);
};

var getBucketData = function (client, bucketName, method, processor, filename) {
    var asset = "var/s3/buckets/"+bucketName+"/"+filename;

    var p = AwsDataUtils.collectFromAws(client, "S3", method, [{Bucket: bucketName}])
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

var fetchBucketAcl = function (client, bucketName) {
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
    return getBucketData(client, bucketName, "getBucketAcl", processor, "acl.json");
};

var fetchBucketLifecycle = function (client, bucketName) {
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
    return getBucketData(client, bucketName, "getBucketLifecycle", processor, "lifecycle.json");
};

var fetchBucketLogging = function (client, bucketName) {
    return getBucketData(client, bucketName, "getBucketLogging", null, "logging.json");
};

var fetchBucketPolicy = function (client, bucketName) {
    // Policy decoding: not compatible with the old ruby code.  Here, we
    // decode inline.  The ruby version created a separate asset.
    var processor = function (r) {
        if (r.Policy !== null) {
            r.Policy = JSON.parse(r.Policy);
        }
        return r;
    };
    return getBucketData(client, bucketName, "getBucketPolicy", processor, "policy.json");
};

var fetchBucketTagging = function (client, bucketName) {
    var processor = function (r) {
        r.TagSet.sort(function (a, b) {
            if (a.Key.toLowerCase() < b.Key.toLowerCase()) return -1;
            else if (a.Key.toLowerCase() > b.Key.toLowerCase()) return +1;
            else return 0;
        });
        return r;
    };
    return getBucketData(client, bucketName, "getBucketTagging", processor, "tags.json");
};

var getBucketDetails = function (client, bucketName) {
    var clientForBucket = getClientForBucket(client, bucketName);
    var args = Q([ clientForBucket, bucketName ]);
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

    var buckets = client.then(listBuckets).then(AwsDataUtils.saveJsonTo("var/s3/list-buckets.json"));
    var bucketDetails = Q.all([ client, buckets ]).spread(collectBucketDetails);

    return Q.all([
        buckets,
        bucketDetails
    ]);
};

module.exports = {
    collectAll: collectAll
};
