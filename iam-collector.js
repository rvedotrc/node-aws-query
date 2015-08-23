var AWS = require('aws-sdk');
var Q = require('q');
var csv = require("fast-csv");

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

var generateCredentialReport = function (iam) {
    return collectFromAws(iam, "IAM", "generateCredentialReport", []);
};

var getCredentialReport = function (iam) {
    return collectFromAws(iam, "IAM", "getCredentialReport", [])
        .fail(function (v) {
            if (v.statusCode === 410) {
                // generate (not present, or expired)
                return Q(iam).then(generateCredentialReport).delay(2000).thenResolve(iam).then(getCredentialReport);
            } else if (v.statusCode === 404) {
                // not ready (generation in progress)
                return Q(iam).delay(2000).then(getCredentialReport);
            } else {
                // other error
                return Q.reject(v);
            }
        });
};

var getCredentialReportCsv = function (iam) {
    return getCredentialReport(iam)
        .then(function (v) {
            if (v.ReportFormat !== 'text/csv') throw new Error('getCredentialReport did not return text/csv');
            var csv = new Buffer(v.Content, 'base64').toString();
            if (csv !== "" && csv[csv.length-1] !== "\n") csv = csv + "\n";
            return csv;
        });
};

var parseCsv = function (csvString) {
    var d = Q.defer();
    process.nextTick(function () {
        var rows = [];
        csv.fromString(csvString, {headers: true})
            .on("data", function (data) {
                console.log("csv data =", data);
                rows.push(data);
            })
            .on("end", function () {
                d.resolve({ CredentialReport: rows });
            });
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
    if (data.IsTruncated === false) {
        delete data.IsTruncated;
    }
    return data;
};

var joinResponses = function (key) {
    return function (responses) {
        var answer = {};
        answer[key] = [];

        // TODO warn if any response contains any key other than 'key'

        for (var i=0; i<responses.length; ++i) {
            answer[key] = answer[key].concat(responses[i][key]);
        }

        return answer;
    };
};

var saveContentTo = function (filename) {
    return function (data) {
        console.log("going to save content");
        return AtomicFile.writeString(data, filename);
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

    var gcr = iam.then(getCredentialReportCsv).then(saveContentTo("var/iam/credential-report.raw"));
    var jcr = gcr.then(parseCsv).then(saveJsonTo("var/iam/credential-report.json"));

    var laa = iam.then(listAccountAliases).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-account-aliases.json"));
    var lu = iam.then(listUsers).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-users.json"));
    var lr = iam.then(listRoles).then(tidyResponseMetadata).then(saveJsonTo("var/iam/list-roles.json"));
    var lak = Q.all([ iam, lu ]).spread(listAccessKeys).then(saveJsonTo("var/iam/list-access-keys.json"));

    return Q.all([
        gcr, jcr,
        laa,
        lu,
        lr,
        lak
    ]);
};

module.exports = {
    collectAll: collectAll
};
