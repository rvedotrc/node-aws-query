var CloudWatchCollector = require('./cloudwatch-collector');
var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var SNSCollector = require('./sns-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

// TODO for parity with ruby code:
// S3 (buckets and their acl/lifecycle/logging/policy/tags)

Q.all([
    CloudWatchCollector.collectAll(),
    EC2Collector.collectAll(),
    IAMCollector.collectAll(),
    SNSCollector.collectAll(),
    SQSCollector.collectAll(),
    Q(true)
]).done();
