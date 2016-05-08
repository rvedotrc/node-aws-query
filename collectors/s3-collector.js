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

var AtomicFile = require('../util/atomic-file');
var AwsDataUtils = require('../util/aws-data-utils');

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
    if (loc === null || loc === "") {
        loc = "standard";
    } else if (loc === "EU") {
        loc = "eu-west-1";
    }

    var asset = "service/s3/location/"+loc+"/bucket/"+bucketName+"/"+filename;

    var p = AwsDataUtils.collectFromAws(client, method, {Bucket: bucketName})
        .then(AwsDataUtils.tidyResponseMetadata);

    if (processor) {
        p = p.then(processor);
    }

    return p.then(AtomicFile.saveJsonTo(asset))
        .fail(function (e) {
            if (e.statusCode === 404) {
                return;
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

var fetchBucketCors = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketCors", null, "cors.json");
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

var fetchBucketNotificationConfiguration = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketNotificationConfiguration", null, "notification-configuration.json");
};

var fetchBucketPolicy = function (client, loc, bucketName) {
    // Policy decoding: not compatible with the old ruby code.  Here, we
    // decode inline.  The ruby version created a separate asset.
    return getBucketData(client, loc, bucketName, "getBucketPolicy", AwsDataUtils.decodeJsonInline("Policy"), "policy.json");
};

var fetchBucketReplication = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketReplication", null, "replication.json");
};

var fetchBucketRequestPayment = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketRequestPayment", null, "request-payment.json");
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

var fetchBucketVersioning = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketVersioning", null, "versioning.json");
};

var fetchBucketWebsite = function (client, loc, bucketName) {
    return getBucketData(client, loc, bucketName, "getBucketWebsite", null, "website.json");
};

var getBucketDetails = function (client, bucketName) {
    var locationForBucket = getLocationForBucket(client, bucketName);
    var clientForBucket = locationForBucket.then(getClientForLocation);
    var args = Q([ clientForBucket, locationForBucket, bucketName ]);
    return Q.all([
        args.spread(fetchBucketAcl),
        args.spread(fetchBucketCors),
        args.spread(fetchBucketLifecycle),
        args.spread(fetchBucketLogging),
        args.spread(fetchBucketNotificationConfiguration),
        args.spread(fetchBucketPolicy),
        // args.spread(fetchBucketReplication),
        args.spread(fetchBucketRequestPayment),
        args.spread(fetchBucketTagging),
        args.spread(fetchBucketVersioning),
        // args.spread(fetchBucketWebsite),
        Q(true)
    ]);
};

var collectAll = function () {
    var client = promiseClient();

    var buckets = client.then(listBuckets).then(AtomicFile.saveJsonTo("service/s3/list-buckets.json"));
    var bucketDetails = Q.all([ client, buckets ]).spread(collectBucketDetails);

    return Q.all([
        buckets,
        bucketDetails
    ]);
};

module.exports = {
    collectAll: collectAll
};
