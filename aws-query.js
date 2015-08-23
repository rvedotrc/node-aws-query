var IAMCollector = require('./iam-collector');
var Q = require('q');

//var AtomicFile = require('./atomic-file');

//var struct = { some: 'data', more: ['d','a',{t:'a'}], t: true, f:false, n: 7, x: null, u: undefined, eo: {}, ea: []};

// AtomicFile.writeJson(struct, "test-data.json")
//     .then(function () {
//         console.log("complete");
//     })
//     .done();

IAMCollector.collectAll().done();
