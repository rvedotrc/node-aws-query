var IAMCollector = require('./iam-collector');
var SQSCollector = require('./sqs-collector');
var Q = require('q');

Q.longStackSupport = true;

Q.all([
    IAMCollector.collectAll(),
    SQSCollector.collectAll()
]).done();
