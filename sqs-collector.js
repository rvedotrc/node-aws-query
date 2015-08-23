var AWS = require('aws-sdk');
var Q = require('q');
var path = require('path');

var AwsDataUtils = require('./aws-data-utils');
var SqsListAllQueues = require('./sqs-list-all-queues');

var promiseSQS = function () {
    return Q(new AWS.SQS({ region: 'eu-west-1' }));
};

var listAllQueues = function (sqs) {
    return SqsListAllQueues.listAllQueues(sqs);
};

var queueUrlsToNames = function(r) {
    var s = '';
    for (var i=0; i < r.QueueUrls.length; ++i) {
        s += path.basename(r.QueueUrls[i]) + "\n";
    }
    return s;
};

var collectAll = function () {
    var sqs = promiseSQS();

    return sqs.then(listAllQueues).then(AwsDataUtils.saveJsonTo("var/sqs/list-all-queues.json"))
        .then(queueUrlsToNames).then(AwsDataUtils.saveContentTo("var/sqs/list-all-queues.txt"));
};

module.exports = {
    collectAll: collectAll
};
