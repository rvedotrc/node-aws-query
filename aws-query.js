var CloudWatchCollector = require('./cloudwatch-collector');
var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var S3Collector = require('./s3-collector');
var SNSCollector = require('./sns-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

// TODO for parity with ruby code:
// - S3 acl/lifecycle/logging/policy/tags of each bucket
// - delete stale assets (e.g. things that are gone)

Q.all([
    CloudWatchCollector.collectAll(),
    EC2Collector.collectAll(),
    IAMCollector.collectAll(),
    S3Collector.collectAll(),
    SNSCollector.collectAll(),
    SQSCollector.collectAll(),
    Q(true)
]).done();
