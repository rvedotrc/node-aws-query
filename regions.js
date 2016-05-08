var data = require("./regions-data");

var pattern = ".";

module.exports.setFilter = function (s) {
    pattern = s;
};

module.exports.regionsForService = function(service) {
    return data[service].filter(function (r) {
        return r.match(pattern);
    });
};
