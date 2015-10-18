var Q = require('q');
var proxy = require('https-proxy-agent');

var CloudFormationCollector = require('./cloudformation-collector');
var CloudWatchCollector = require('./cloudwatch-collector');
var DynamoDB = require('./dynamodb-collector');
var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var LambdaCollector = require('./lambda-collector');
var RDSCollector = require('./rds-collector');
var Route53Collector = require('./route53-collector');
var S3Collector = require('./s3-collector');
var SNSCollector = require('./sns-collector');
var SQSCollector = require('./sqs-collector');

Q.longStackSupport = true;

var config = require('./options-parser').parse(process.argv);

var clientConfig = {};

(function () {
    // e.g. https_proxy=http://host:3128
    var https_proxy = process.env.https_proxy;
    if (https_proxy) {
        if (!clientConfig.httpOptions) clientConfig.httpOptions = {};
        clientConfig.httpOptions.agent = proxy(https_proxy);
    }
})();

// TODO, things I'd like to add, in the order that would be of most interest
// to me:
// more info from dynamodb
// more info from lambda
// simpledb
// rds
// ses
// api gateway? (not supported by SDK at this time)
// cloudformation
// cloudfront
// cloudsearch
// ecs
// efs
// emr
// ets (not supported by SDK at this time)
// glacier
// kinesis

// Also, TODO, add a command-line way to run only some subset of the
// collectors.

if (config.cloudformation) {
    if (config.stack) {
        CloudFormationCollector.collectOneStack(clientConfig, config.stack).done();
    } else {
        CloudFormationCollector.collectAll(clientConfig, config.exhaustive).done();
    }
} else {
    Q.all([
        CloudWatchCollector.collectAll(clientConfig),
        DynamoDB.collectAll(clientConfig),
        EC2Collector.collectAll(clientConfig),
        IAMCollector.collectAll(clientConfig),
        LambdaCollector.collectAll(clientConfig),
        RDSCollector.collectAll(clientConfig),
        Route53Collector.collectAll(clientConfig),
        S3Collector.collectAll(clientConfig),
        SNSCollector.collectAll(clientConfig),
        SQSCollector.collectAll(clientConfig),
        Q(true)
    ]).done();
}
