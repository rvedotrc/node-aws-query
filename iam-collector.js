var AWS = require('aws-sdk');
var Q = require('q');

Q.longStackSupport = true;

var AtomicFile = require('./atomic-file');

var promiseIAM = function () {
    return Q(new AWS.IAM);
};

var collectFromAws = function (client, clientName, method, args) {
    var d = Q.defer();
    process.nextTick(function () {
        console.log(clientName, method, args);
        var cb = function (err, data) {
            if (err === null) {
                console.log(clientName, method, args, "succeeded with", data);
                d.resolve(data);
            } else {
                console.log(clientName, method, args, "failed with", err);
                d.reject(err);
            }
        };
        client[method].apply(client, args.concat(cb));
    });
    return d.promise;
};

var listUsers = function (iam) {
    return collectFromAws(iam, "IAM", "listUsers", []);
};

var listAccountAliases = function (iam) {
    return collectFromAws(iam, "IAM", "listAccountAliases", []);
};

var tidyResponseMetadata = function (data) {
    if (data.ResponseMetadata) {
        delete data.ResponseMetadata.RequestId;
        if (Object.keys(data.ResponseMetadata).length === 0) {
            delete data.ResponseMetadata;
        }
    }
    return data;
};

var saveJsonTo = function (filename) {
    return function (data) {
        console.log("going to save data");
        return AtomicFile.writeJson(data, filename);
    };
};

var collectAll = function () {
    var iam = promiseIAM();

    var laa = iam.then(listAccountAliases).then(tidyResponseMetadata);
    var lu = iam.then(listUsers).then(tidyResponseMetadata);

    var lak = Q.all([ iam, lu ])
        .spread(function (iamClient, listOfUsers) {
            console.log(listOfUsers);
            console.log(listOfUsers.Users);
            console.log(listOfUsers.Users.length);
            var all = [];
            for (var i=0; i<listOfUsers.Users.length; ++i) {
                (function (userName) {
                    all.push(
                        Q(true)
                        .then(function () {
                            return collectFromAws(iamClient, "IAM", "listAccessKeys", [ { UserName: userName } ])
                        })
                        .then(tidyResponseMetadata)
                        .then(saveJsonTo("var/iam/list-access-keys."+userName+".json"))
                    );
                })(listOfUsers.Users[i].UserName);
            }
            return Q.all(all);
        });

    return Q.all([
        laa.then(saveJsonTo("var/iam/list-account-aliases.json")),
        lu.then(saveJsonTo("var/iam/list-users.json")),
        lak
    ]);
};

module.exports = {
    collectAll: collectAll
};

