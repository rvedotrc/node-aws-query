var AWS = require('aws-sdk');
var Q = require('q');
var csv = require("fast-csv");

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.IAM());
};

var generateCredentialReport = function (client) {
    return AwsDataUtils.collectFromAws(client, "IAM", "generateCredentialReport");
};

var getCredentialReport = function (client) {
    return AwsDataUtils.collectFromAws(client, "IAM", "getCredentialReport")
        .fail(function (v) {
            if (v.statusCode === 410) {
                // generate (not present, or expired)
                return Q(client).then(generateCredentialReport).delay(2000).thenResolve(client).then(getCredentialReport);
            } else if (v.statusCode === 404) {
                // not ready (generation in progress)
                return Q(client).delay(2000).then(getCredentialReport);
            } else {
                // other error
                return Q.reject(v);
            }
        });
};

var getCredentialReportCsv = function (client) {
    return getCredentialReport(client)
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

var listRoles = function (client) {
    return AwsDataUtils.collectFromAws(client, "IAM", "listRoles", {}, "Roles")
        .then(function (v) {
            var roles = v.Roles;
            for (var i=0; i<roles.length; ++i) {
                roles[i].AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(roles[i].AssumeRolePolicyDocument));
            }
            return v;
        });
};

var listUsers = function (client) {
    return AwsDataUtils.collectFromAws(client, "IAM", "listUsers", {}, "Users");
};

var listAccountAliases = function (client) {
    return AwsDataUtils.collectFromAws(client, "IAM", "listAccountAliases");
};

var joinResponses = function (key) {
    return function (responses) {
        var answer = {};
        answer[key] = [];

        // TODO what if any response contains any key other than 'key'?

        for (var i=0; i<responses.length; ++i) {
            answer[key] = answer[key].concat(responses[i][key]);
        }

        return answer;
    };
};

var listAccessKeys = function (client, listOfUsers) {
    var all = [];

    for (var i=0; i<listOfUsers.Users.length; ++i) {
        all.push(
            Q([ client, listOfUsers.Users[i].UserName ])
                .spread(listAccessKeysForUser)
                .then(AwsDataUtils.tidyResponseMetadata)
        );
    }

    return Q.all(all).then(joinResponses("AccessKeyMetadata"));
};

var listAccessKeysForUser = function (client, userName) {
    return AwsDataUtils.collectFromAws(client, "IAM", "listAccessKeys", { UserName: userName });
};

var collectAll = function () {
    var client = promiseClient();

    var gcr = client.then(getCredentialReportCsv).then(AwsDataUtils.saveContentTo("var/service/iam/credential-report.raw"));
    var jcr = gcr.then(parseCsv).then(AwsDataUtils.saveJsonTo("var/service/iam/credential-report.json"));

    var laa = client.then(listAccountAliases).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-account-aliases.json"));
    var lu = client.then(listUsers).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-users.json"));
    var lr = client.then(listRoles).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-roles.json"));
    var lak = Q.all([ client, lu ]).spread(listAccessKeys).then(AwsDataUtils.saveJsonTo("var/service/iam/list-access-keys.json"));

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
