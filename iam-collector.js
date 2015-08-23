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

var listRoles = function (iam) {
    return collectFromAws(iam, "IAM", "listRoles", [])
        .then(function (v) {
            var roles = v.Roles;
            for (var i=0; i<roles.length; ++i) {
                roles[i].AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(roles[i].AssumeRolePolicyDocument));
            }
            return v;
        });
};

var listUsers = function (iam) {
    return collectFromAws(iam, "IAM", "listUsers", []);
};

var listAccountAliases = function (iam) {
    return collectFromAws(iam, "IAM", "listAccountAliases", []);
};

var listAccessKeys = function (iam, listOfUsers) {
    var all = [];

    for (var i=0; i<listOfUsers.Users.length; ++i) {
        (function (userName) {
            all.push(
                Q(true)
                .then(function () {
                    return collectFromAws(iam, "IAM", "listAccessKeys", [ { UserName: userName } ])
                })
                .then(tidyResponseMetadata)
            );
        })(listOfUsers.Users[i].UserName);
    }

    return Q.all(all).then(joinResponses("AccessKeyMetadata"));
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
    var lr = iam.then(listRoles).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-roles.json"));
    var lak = Q.all([ iam, lu ]).spread(listAccessKeys).then(saveJsonTo("var/iam/list-access-keys.json"));

    return Q.all([
        laa,
        lu,
        lr,
        lak
    ]);
};

module.exports = {
    collectAll: collectAll
};
