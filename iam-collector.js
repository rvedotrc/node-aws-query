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

var joinResponses = function (key) {
    return function (responses) {
        if (responses.length === 0) return null;
        var answer = responses[0];
        for (var i=1; i<responses.length; ++i) {
            answer[key] = answer[key].concat(responses[i][key]);
        }
        return answer;
    };
};

var saveJsonTo = function (filename) {
    return function (data) {
        console.log("going to save data");
        return AtomicFile.writeJson(data, filename);
    };
};

var collectAll = function () {
    var iam = promiseIAM();

    var laa = iam.then(listAccountAliases).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-account-aliases.json"));
    var lu = iam.then(listUsers).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-users.json"));

    var lak = Q.all([ iam, lu ])
        .spread(function (iamClient, listOfUsers) {
            var all = [];
            for (var i=0; i<listOfUsers.Users.length; ++i) {
                (function (userName) {
                    all.push(
                        Q(true)
                        .then(function () {
                            return collectFromAws(iamClient, "IAM", "listAccessKeys", [ { UserName: userName } ])
                        })
                        .then(tidyResponseMetadata)
                    );
                })(listOfUsers.Users[i].UserName);
            }
            return Q.all(all)
                .then(joinResponses("AccessKeyMetadata"))
                .then(saveJsonTo("var/iam/list-access-keys.json"))
                ;
        });

    return Q.all([
        laa,
        lu,
        lak
    ]);
};

module.exports = {
    collectAll: collectAll
};

