aws-query: Produce stable json reports of an AWS account
========================================================

Synopsis
--------

`  . my/amazon/credentials`  
`  mkdir ./var`  
`  node --use-strict ./aws-query.js`  

Summary
-------

`aws-query` performs various read-only API calls ("List", "Get", "Describe",
...) against your Amazon Web Services account, saving the results to local
JSON files.  The output is intended to be stable: object keys are always
sorted, and lists (where the order itself is effectively meaningless) are
sorted by something relevant to provide stability.

The intention is that you can "diff" the output of successive runs of
`aws-query` to see a reasonably meaningful set of changes.  For example, you
could commit each run to `git` or similar to collect a history of your
account.

What is queried
---------------

The querying is incomplete: not all AWS services are considered, and of the
ones that are considered, not everything is queried.  However the intention is
that, over time, what is already queried should remain stable, and new queries
will be added.

Querying currently includes:

 * CloudTrail: describeTrails
 * CloudWatch: describeAlarms
 * CloudWatch Events; listRules, listTargetsByRule
 * DynamoDB: listTables
 * EC2: describeInstances, describeAddresses, describeAvailabilityZones,
   describeAccountAttributes
 * IAM: getAccountAuthorizationDetails, getCredentialReport,
   listAccountAliases, listAccessKeys
 * Lambda: listFunctions
 * RDS: describeDBInstances
 * Route53: listHostedZones
 * S3: listBuckets, and for each bucket: getBucketAcl, getBucketLifecycle,
   getBucketLogging, getBucketPolicy, getBucketTagging
 * SNS: listTopics, listSubscriptions
 * SQS: listQueues, and for each queue: getQueueAttributes

Use `--services=REGEXP` to filter which services are processed.

Use `--regions=REGEXP` to filter which regions are processed.

The output
----------

The files are dumped to to `./var`, but this can be changed with
`--directory=DIR`.

The structure of the files created by `aws-query` generally follows the
pattern `var/service/S/region/R/something.json`, for each service (e.g. ec2)
and each region.  Notable exceptions include IAM (regionless), and S3
("location" is used instead of "region").

Some of the dumped data is very much in the form provided by the SDK, albeit
with pagination followed, sorting applied, and response metadata removed.
Other data is rather less so - some files may be the result of several
different API calls stitched together.

The set of files dumped can vary - e.g. the "per bucket" and "per queue"
files.  Currently, `aws-query` does _not_ delete "old" files.  Hence, unless
`./var` starts off empty, you might end up with a mixture of files from this
run, and from some previous run.  Therefore you might want to `rm -rf var/*`
before running `aws-query`.

Miscellany
----------

Authentication is via your environment variables (`AWS_ACCESS_KEY_ID` etc).

Future directions
-----------------

 * More unit tests.
 * More query coverage.
 * Some sort of mechanism to allow multiple accounts (i.e. sets
   of credentials) to be queried concurrently.

Notes on the code
-----------------

The unit test coverage is not great.  Sorry.

`sqs-list-all-queues.js` and `prefix-truncation-expander.js` implement an
algorithm for listing all queues, bypassing the 1000-result listQueues limit
(which is a bug in AWS).  This code could be spun off into its own module.

