var AWS = require('aws-sdk');
var Q = require('q');
var csv = require("fast-csv");

var AwsDataUtils = require('./aws-data-utils');

var promiseIAM = function () {
    return Q(new AWS.IAM());
};

var generateCredentialReport = function (iam) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "generateCredentialReport", []);
};

var getCredentialReport = function (iam) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "getCredentialReport", [])
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
                rows.push(data);
            })
            .on("end", function () {
                d.resolve({ CredentialReport: rows });
            });
    });
    return d.promise;
};

var listRoles = function (iam) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "listRoles", [])
        .then(function (v) {
            var roles = v.Roles;
            for (var i=0; i<roles.length; ++i) {
                roles[i].AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(roles[i].AssumeRolePolicyDocument));
            }
            return v;
        });
};

var listUsers = function (iam) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "listUsers", []);
};

var listAccountAliases = function (iam) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "listAccountAliases", []);
};

var listAccessKeys = function (iam, listOfUsers) {
    var all = [];

    for (var i=0; i<listOfUsers.Users.length; ++i) {
        all.push(
            Q([ iam, listOfUsers.Users[i].UserName ])
                .spread(listAccessKeysForUser)
                .then(AwsDataUtils.tidyResponseMetadata)
        );
    }

    return Q.all(all).then(AwsDataUtils.joinResponses("AccessKeyMetadata"));
};

var listAccessKeysForUser = function (iam, userName) {
    return AwsDataUtils.collectFromAws(iam, "IAM", "listAccessKeys", [ { UserName: userName } ]);
};

var collectAll = function () {
    var iam = promiseIAM();

    var gcr = iam.then(getCredentialReportCsv).then(AwsDataUtils.saveContentTo("var/service/iam/credential-report.raw"));
    var jcr = gcr.then(parseCsv).then(AwsDataUtils.saveJsonTo("var/service/iam/credential-report.json"));

    var laa = iam.then(listAccountAliases).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-account-aliases.json"));
    var lu = iam.then(listUsers).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-users.json"));
    var lr = iam.then(listRoles).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-roles.json"));
    var lak = Q.all([ iam, lu ]).spread(listAccessKeys).then(AwsDataUtils.saveJsonTo("var/service/iam/list-access-keys.json"));

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
