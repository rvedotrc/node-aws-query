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

var parse = function (args) {
    var program = require('commander');
    program
        .version('0.0.1')
        .option('--cloudformation', "Collect cloudformation data and nothing else")
        .option('--exhaustive', "Do not optimise by stack status")
        .option('--stack <arn>', "Only process this stack (only valid with --cloudformation)")
        .parse(args);
    return program;
};

module.exports = {
    parse: parse,
};
