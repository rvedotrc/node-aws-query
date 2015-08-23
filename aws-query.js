var IAMCollector = require('./iam-collector');
var Q = require('q');

Q.longStackSupport = true;

IAMCollector.collectAll().done();
