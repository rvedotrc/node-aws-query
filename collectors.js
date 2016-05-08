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

var fs = require('fs');

var getCollectors = function (servicePattern) {
    return fs.readdirSync(__dirname + "/collectors")
        .filter(function (n) {
            if (!n.endsWith("-collector.js")) return false;
            var name = n.replace(/-collector\.js$/, "");
            if (name === "cloudformation") return false;
            return name.match(servicePattern);
        })
        .map(function (n) {
            return require("./collectors/" + n);
        });
};

module.exports = {
    getCollectors: getCollectors,
};
