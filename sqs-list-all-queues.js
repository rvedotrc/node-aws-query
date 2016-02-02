/*
Copyright 2016 Rachel Evans

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var Q = require('q');
var path = require('path');

var AwsDataUtils = require('./aws-data-utils');
var PrefixTruncationExpander = require('./prefix-truncation-expander');

var alphabet = '0123456789' +
    '-ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '_abcdefghijklmnopqrstuvwxyz';

var maxResults = 1000;

var listAllQueues = function(sqs, prefix) {
    var expander = new PrefixTruncationExpander(
        function (p) {
            return AwsDataUtils.collectFromAws(sqs, "listQueues", { QueueNamePrefix: p })
                .then(function (r) {
                    return r.QueueUrls || [];
                });
        },
        function (s) {
            return path.basename(s);
        },
        alphabet,
        maxResults
    );

    return expander.expand(prefix)
        .then(function (urls) {
            return { QueueUrls: urls };
        });
};

module.exports = {
    listAllQueues: listAllQueues
};
