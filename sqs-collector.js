var AWS = require('aws-sdk');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SqsListAllQueues = require('./sqs-list-all-queues');

var promiseSQS = function () {
    return Q(new AWS.SQS({ region: 'eu-west-1' }));
};

var listAllQueues = function (sqs) {
    return SqsListAllQueues.listAllQueues(sqs);
};

var collectAll = function () {
    var sqs = promiseSQS();

    return sqs.then(listAllQueues).then(AwsDataUtils.saveJsonTo("var/sqs/list-all-queues.json"));
};

module.exports = {
    collectAll: collectAll
};
