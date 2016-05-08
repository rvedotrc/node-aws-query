var data = require("./regions-data");

module.exports.regionsForService = function(service) {
    return data[service];
};
