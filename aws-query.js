var CloudWatchCollector = require('./cloudwatch-collector');
var DynamoDB = require('./dynamodb-collector');
var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var S3Collector = require('./s3-collector');
var SNSCollector = require('./sns-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

// TODO for parity with ruby code:
// - delete stale assets (e.g. things that are gone)

var clientConfig = {};

Q.all([
    CloudWatchCollector.collectAll(clientConfig),
    DynamoDB.collectAll(clientConfig),
    EC2Collector.collectAll(clientConfig),
    IAMCollector.collectAll(clientConfig),
    S3Collector.collectAll(clientConfig),
    SNSCollector.collectAll(clientConfig),
    SQSCollector.collectAll(clientConfig),
    Q(true)
]).done();
