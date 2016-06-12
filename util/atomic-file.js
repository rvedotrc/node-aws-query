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

var CanonicalJson = require('canonical-json');
var Q = require('q');
var fs = require('fs');
var path = require('path');

var TreeMaker = require('./tree-maker');

var writeString = function (body, filename) {
    return TreeMaker.mkpath(path.dirname(filename)).then(function () {
        var tmpFilename = filename + ".tmp";
        var d = Q.defer();

        process.nextTick(function () {
            fs.writeFile(tmpFilename, body, {'flag': 'w'}, function(err) {
                if (err) {
                    fs.unlink(tmpFilename, function(unlinkErr) {
                        // ignore unlinkErr
                        d.reject(err);
                    });
                } else {
                    fs.rename(tmpFilename, filename, function(err) {
                        if (err) {
                            fs.unlink(tmpFilename, function(unlinkErr) {
                                // ignore unlinkErr
                                d.reject(err);
                            });
                        } else {
                            console.log("Wrote", body.length, "bytes to", filename);
                            d.resolve(body);
                        }
                    });
                }
            });
        });

        return d.promise;
    });
};

var writeJson = function (data, filename) {
    return writeString(CanonicalJson(data, null, 2)+"\n", filename).thenResolve(data);
};

var rootDir = ".";

var setRootDir = function (dir) {
    rootDir = dir;
};

var saveContentTo = function (filename) {
    return function (data) {
        return writeString(data, rootDir + "/" + filename);
    };
};

var saveJsonTo = function (filename) {
    return function (data) {
        return writeJson(data, rootDir + "/" + filename);
    };
};

var expand = function (path) {
    return rootDir + "/" + path;
};

module.exports = {
    setRootDir: setRootDir,
    saveContentTo: saveContentTo,
    saveJsonTo: saveJsonTo,
    expand: expand
};
