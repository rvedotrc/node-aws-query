var AWS = require('aws-sdk');
var Q = require('q');
var csv = require("fast-csv");
var merge = require("merge");

var AtomicFile = require('./atomic-file');
var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.IAM());
};

var generateCredentialReport = function (client) {
    return AwsDataUtils.collectFromAws(client, "generateCredentialReport");
};

var getCredentialReport = function (client) {
    return AwsDataUtils.collectFromAws(client, "getCredentialReport")
        .fail(function (v) {
            if (v.statusCode === 410) { // v.code == "ReportNotPresent"
                // generate (not present, or expired)
                return Q(client).then(generateCredentialReport).delay(2000).thenResolve(client).then(getCredentialReport);
            } else if (v.statusCode === 404) { // v.code == "ReportInProgress"
                // not ready (generation in progress)
                return Q(client).delay(v.retryDelay * 1000).then(getCredentialReport);
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

var listAccountAliases = function (client) {
    return AwsDataUtils.collectFromAws(client, "listAccountAliases");
};

var listAccessKeys = function (client, listOfUserNames) {
    return Q.all(
        listOfUserNames.map(function (u) {
            return Q([ client, u ]).spread(listAccessKeysForUser).then(AwsDataUtils.tidyResponseMetadata);
        })
    ).then(function (responses) {
        var allAKM = [];
        responses.forEach(function (e) { allAKM = allAKM.concat(e.AccessKeyMetadata); });
        return { AccessKeyMetadata: allAKM };
    });
};

var listAccessKeysForUser = function (client, userName) {
    return AwsDataUtils.collectFromAws(client, "listAccessKeys", { UserName: userName });
};

var getAccountAuthorizationDetails = function (client) {
    var paginationHelper = {
        nextArgs: function (args, data) {
            if (!data.Marker) return;
            return merge(true, args, {Marker: data.Marker});
        },
        promiseOfJoinedData: function (data1, data2) {
            return {
                UserDetailList: data1.UserDetailList.concat(data2.UserDetailList),
                GroupDetailList: data1.GroupDetailList.concat(data2.GroupDetailList),
                RoleDetailList: data1.RoleDetailList.concat(data2.RoleDetailList),
                Policies: data1.Policies.concat(data2.Policies)
            };
        }
    };
    return AwsDataUtils.collectFromAws(client, "getAccountAuthorizationDetails", {}, paginationHelper);
};

var decodePoliciesForAuthDetails = function (l) {
    l.GroupDetailList.forEach(function (g) {
        g.GroupPolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });
    });

    l.RoleDetailList.forEach(function (r) {
        r.AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(r.AssumeRolePolicyDocument));

        r.RolePolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });

        r.InstanceProfileList.forEach(function (ip) {
            // role returned within itself
            ip.Roles.forEach(function (innerRole) {
                innerRole.AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(innerRole.AssumeRolePolicyDocument));
            });
        });
    });

    l.UserDetailList.forEach(function (u) {
        u.UserPolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });
    });

    l.Policies.forEach(function (p) {
        p.PolicyVersionList.forEach(function (pv) {
            pv.Document = JSON.parse(decodeURIComponent(pv.Document));
        });
    });

    return l;
};

var collectAll = function () {
    var client = promiseClient();

    var gaad = Q.all([ client ]).spread(getAccountAuthorizationDetails)
        .then(decodePoliciesForAuthDetails)
        .then(AtomicFile.saveJsonTo("var/service/iam/account-authorization-details.json"));

    var gcr = client.then(getCredentialReportCsv).then(AtomicFile.saveContentTo("var/service/iam/credential-report.raw"));
    var jcr = gcr.then(parseCsv).then(AtomicFile.saveJsonTo("var/service/iam/credential-report.json"));

    var laa = client.then(listAccountAliases).then(AwsDataUtils.tidyResponseMetadata).then(AtomicFile.saveJsonTo("var/service/iam/list-account-aliases.json"));

    var listOfUserNames = Q(gaad).then(function (l) {
        return l.UserDetailList.map(function (u) { return u.UserName; });
    });
    var lak = Q.all([ client, listOfUserNames ]).spread(listAccessKeys).then(AtomicFile.saveJsonTo("var/service/iam/list-access-keys.json"));

    return Q.all([
        gaad,
        gcr, jcr,
        laa,
        lak,
        Q(true)
    ]);
};

module.exports = {
    collectAll: collectAll
};
