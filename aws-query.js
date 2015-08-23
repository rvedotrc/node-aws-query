var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

// TODO for parity with ruby code:
// Cloudwatch (alarms)
// S3 (buckets and their acl/lifecycle/logging/policy/tags)
// SNS (subscriptions, topics)

Q.all([
    EC2Collector.collectAll(),
    IAMCollector.collectAll(),
    SQSCollector.collectAll()
]).done();
