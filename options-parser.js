var parse = function (args) {
    var program = require('commander');
    program
        .version('0.0.1')
        .option('--cloudformation', "Collect cloudformation data and nothing else")
        .option('--stack <arn>', "Only process this stack (only valid with --cloudformation)")
        .parse(args);
    return program;
};

module.exports = {
    parse: parse,
};
