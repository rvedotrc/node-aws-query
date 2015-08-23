var EC2Collector = require('./ec2-collector');
var IAMCollector = require('./iam-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

Q.all([
    EC2Collector.collectAll(),
    IAMCollector.collectAll(),
    SQSCollector.collectAll()
]).done();
