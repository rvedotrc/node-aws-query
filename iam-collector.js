var AWS = require('aws-sdk');
var Q = require('q');
var csv = require("fast-csv");
var merge = require("merge");

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

var listGroups = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "Groups");
    return AwsDataUtils.collectFromAws(client, "listGroups", {}, paginationHelper);
};

var getGroup = function (client, groupName) {
    return AwsDataUtils.collectFromAws(client, "getGroup", {GroupName: groupName});
};

var getGroups = function (client, listOfGroups) {
    var all = listOfGroups.Groups.map(function (g) {
        return Q([ client, g.GroupName ]).spread(getGroup).then(AwsDataUtils.tidyResponseMetadata);
    });

    return Q.all(all)
        .then(function (groupResponses) {
            return groupResponses.reduce(function (h, r) {
                h[r.Group.GroupName] = r;
                return h;
            }, {});
        });
};

var listRoles = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "Roles");

    return AwsDataUtils.collectFromAws(client, "listRoles", {}, paginationHelper)
        .then(function (v) {
            v.Roles.forEach(function (ele) {
                ele.AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(ele.AssumeRolePolicyDocument));
            });
            return v;
        });
};

var listUsers = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "Users");
    return AwsDataUtils.collectFromAws(client, "listUsers", {}, paginationHelper);
};

var listAccountAliases = function (client) {
    return AwsDataUtils.collectFromAws(client, "listAccountAliases");
};

var listAccessKeys = function (client, listOfUsers) {
    return Q.all(
        listOfUsers.Users.map(function (u) {
            return Q([ client, u.UserName ]).spread(listAccessKeysForUser).then(AwsDataUtils.tidyResponseMetadata);
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

var getInlinePoliciesForThing = function (client, thingName, thingNameKey, listMethod, getMethod) {
    var nameArgs = {};
    nameArgs[thingNameKey] = thingName;

    return AwsDataUtils.collectFromAws(
        client, listMethod, nameArgs, AwsDataUtils.paginationHelper("Marker", "Marker", "PolicyNames")
    ).then(function (d) {
        return Q.all(
            d.PolicyNames.map(function (policyName) {
                return Q(true).then(function () {
                    return AwsDataUtils.collectFromAws(client, getMethod, merge({}, nameArgs, {PolicyName: policyName}));
                });
            })
        );
    }).then(function (d) {
        var policies = d.reduce(function (h, p) {
            h[ p.PolicyName ] = JSON.parse(decodeURIComponent( p.PolicyDocument ));
            return h;
        }, {});

        return { Name: thingName, InlinePolicies: policies };
    });
};

var getInlinePoliciesForAllThings = function (client, listOfThings, thingsKey, thingNameKey, listMethod, getMethod) {
    return Q.all(
        listOfThings[thingsKey].map(function (thing) {
            return Q.all([ client, thing[thingNameKey], Q(thingNameKey), Q(listMethod), Q(getMethod) ])
                .spread(getInlinePoliciesForThing);
        })
    ).then(function (data) {
        return data.reduce(function (h, pair) {
            h[ pair.Name ] = pair.InlinePolicies;
            return h;
        }, {});
    });
};

var getInlinePoliciesForAllUsers = function (client, listOfUsers) {
    return getInlinePoliciesForAllThings(client, listOfUsers, "Users", "UserName", "listUserPolicies", "getUserPolicy");
};

var getInlinePoliciesForAllGroups = function (client, listOfGroups) {
    return getInlinePoliciesForAllThings(client, listOfGroups, "Groups", "GroupName", "listGroupPolicies", "getGroupPolicy");
};

var getInlinePoliciesForAllRoles = function (client, listOfRoles) {
    return getInlinePoliciesForAllThings(client, listOfRoles, "Roles", "RoleName", "listRolePolicies", "getRolePolicy");
};

var listPolicies = function (client) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "Policies");
    return AwsDataUtils.collectFromAws(client, "listPolicies", {}, paginationHelper);
};

var filterInterestingPolicies = function (listOfPolicies) {
    return {
        Policies: listOfPolicies.Policies.filter(function (p) {
            return p.AttachmentCount > 0 || !p.Arn.match(/^arn:aws:iam::aws:policy\//);
        })
    };
};

var getPolicies = function (client, listOfPolicies) {
    return Q.all(
        listOfPolicies.Policies.map(function (p) {
            return AwsDataUtils.collectFromAws(client, "getPolicy", {PolicyArn: p.Arn})
                .then(function (r) { return r.Policy; });
        })
    ).then(function (l) {
        return { Policies: l };
    });
};

var addVersionsToPolicies = function (client, listOfPolicies) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "Versions");
    return Q.all(
        listOfPolicies.Policies.map(function (p) {
            return AwsDataUtils.collectFromAws(client, "listPolicyVersions", {PolicyArn: p.Arn}, paginationHelper)
                .then(function (r) {
                    return Q.all(
                        r.Versions.map(function (v) {
                            return AwsDataUtils.collectFromAws(client, "getPolicyVersion", {PolicyArn: p.Arn, VersionId: v.VersionId})
                                .then(AwsDataUtils.tidyResponseMetadata)
                                .then(function (vr) {
                                    vr.PolicyVersion.Document = JSON.parse(decodeURIComponent(vr.PolicyVersion.Document));
                                    return vr;
                                });
                        })
                    ).then(function (versions) {
                        var versionsMap = versions.reduce(function (h, e) {
                            h[e.PolicyVersion.VersionId] = e.PolicyVersion;
                            return h;
                        }, {});
                        return { Policy: p, Versions: versionsMap };
                    });
                });
        })
    ).then(function (l) {
        return l.reduce(function (h, policyAndVersions) {
            h[policyAndVersions.Policy.Arn] = policyAndVersions.Versions;
            return h;
        }, {});
    });
};

var findAttachedUserPolicies = function (client, listOfUsers) {
    var names = listOfUsers.Users.map(function (u) { return u.UserName; });
    var argMaker = function (n) { return { UserName: n }; };
    return findAttachedThingPolicies(client, names, "listAttachedUserPolicies", argMaker);
};

var findAttachedRolePolicies = function (client, listOfRoles) {
    var names = listOfRoles.Roles.map(function (u) { return u.RoleName; });
    var argMaker = function (n) { return { RoleName: n }; };
    return findAttachedThingPolicies(client, names, "listAttachedRolePolicies", argMaker);
};

var findAttachedGroupPolicies = function (client, listOfGroups) {
    var names = listOfGroups.Groups.map(function (u) { return u.GroupName; });
    var argMaker = function (n) { return { GroupName: n }; };
    return findAttachedThingPolicies(client, names, "listAttachedGroupPolicies", argMaker);
};

var findAttachedThingPolicies = function (client, listOfNames, listMethod, argMaker) {
    var paginationHelper = AwsDataUtils.paginationHelper("Marker", "Marker", "AttachedPolicies");
    return Q.all(
        listOfNames.map(function (n) {
            return AwsDataUtils.collectFromAws(client, listMethod, argMaker(n), paginationHelper)
                .then(function (r) {
                    return {
                        ThingName: n,
                        PolicyArns: r.AttachedPolicies.map(function (ap) { return ap.PolicyArn; })
                    };
                });
        })
    ).then(function(l) {
        return l.reduce(function (h, thingAndPolicyArns) {
            if (thingAndPolicyArns.PolicyArns.length != 0) {
                h[thingAndPolicyArns.ThingName] = thingAndPolicyArns.PolicyArns;
            }
            return h;
        }, {});
    });
};

var collectAll = function () {
    var client = promiseClient();

    var gcr = client.then(getCredentialReportCsv).then(AwsDataUtils.saveContentTo("var/service/iam/credential-report.raw"));
    var jcr = gcr.then(parseCsv).then(AwsDataUtils.saveJsonTo("var/service/iam/credential-report.json"));

    var laa = client.then(listAccountAliases).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-account-aliases.json"));
    var lu = client.then(listUsers).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-users.json"));
    var lr = client.then(listRoles).then(AwsDataUtils.tidyResponseMetadata).then(AwsDataUtils.saveJsonTo("var/service/iam/list-roles.json"));
    var lak = Q.all([ client, lu ]).spread(listAccessKeys).then(AwsDataUtils.saveJsonTo("var/service/iam/list-access-keys.json"));

    var lg = client.then(listGroups);
    var gg = Q.all([ client, lg ]).spread(getGroups).then(AwsDataUtils.saveJsonTo("var/service/iam/get-groups.json"));

    var getInlinePolicies = Q.all([
        Q.all([ client, lu ]).spread(getInlinePoliciesForAllUsers).then(AwsDataUtils.saveJsonTo("var/service/iam/inline-user-policies.json")),
        Q.all([ client, lr ]).spread(getInlinePoliciesForAllRoles).then(AwsDataUtils.saveJsonTo("var/service/iam/inline-role-policies.json")),
        Q.all([ client, lg ]).spread(getInlinePoliciesForAllGroups).then(AwsDataUtils.saveJsonTo("var/service/iam/inline-group-policies.json")),
        Q(true)
    ]);

    // Note: we discarded any unattached AWS-provided policies, and we add in
    // the Description where available
    var lp = client.then(listPolicies).then(AwsDataUtils.tidyResponseMetadata).then(filterInterestingPolicies);
    var lp2 = Q.all([ client, lp ]).spread(getPolicies).then(AwsDataUtils.saveJsonTo("var/service/iam/list-policies.json"));
    var policiesWithVersions = Q.all([ client, lp2 ]).spread(addVersionsToPolicies)
        .then(AwsDataUtils.saveJsonTo("var/service/iam/policy-versions.json"));

    var findPolicyAttachments = Q.all([
        Q.all([ client, lu ]).spread(findAttachedUserPolicies),
        Q.all([ client, lr ]).spread(findAttachedRolePolicies),
        Q.all([ client, lg ]).spread(findAttachedGroupPolicies),
        Q(true)
    ]).spread(function (u, r, g) {
        return {
            ByUser: u,
            ByRole: r,
            ByGroup: g
        };
    }).then(AwsDataUtils.saveJsonTo("var/service/iam/policies-attachments.json"));

    return Q.all([
        gcr, jcr,
        laa,
        gg,
        lu,
        lr,
        lak,
        getInlinePolicies,
        policiesWithVersions,
        findPolicyAttachments,
        Q(true)
    ]);
};

module.exports = {
    collectAll: collectAll
};
