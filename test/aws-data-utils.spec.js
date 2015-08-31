var assert = require("assert");
require("should");
var sinon = require("sinon");

var AwsDataUtils = require("../aws-data-utils");

describe("AwsDataUtils", function () {

    it('returns a promise to fetch data from AWS', function (mochaDone) {
        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (args, cb) {
                           args.should.eql({"ThingName": "bob"});
                           cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ] });
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {"ThingName": "bob"})
            .then(function (data) {
                console.log("got data", data);
                mochaDone();
            }).done();
    });

    it('fails if the result seems to be truncated but no paginationHelper is provided', function (mochaDone) {
        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (args, cb) {
                           cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ], Marker: "more!" });
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {})
            .fail(function (err) {
                console.log("got err", err);
                err.should.match(/Response seems to contain pagination data, but no paginationHelper was provided/);
                mochaDone();
            }).done();
    });

    it('uses the paginationHelper to make subsequent requests', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";

        var calledWith = [];
        var returns = [
            { Things: [], NextMarker: marker1 },
            { Things: [], NextMarker: marker2 },
            { Things: [] }
        ];

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (opts, cb) {
                calledWith.push(opts);
                cb(null, returns.shift());
            }
        };

        var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Things");
        AwsDataUtils.collectFromAws(anAwsClient, "getThings", { x: 'y' }, paginationHelper)
            .then(function (data) {
                assert.deepEqual([
                    { x: 'y' },
                    { x: 'y', Marker: marker1 },
                    { x: 'y', Marker: marker2 }
                ], calledWith);
                mochaDone();
            }).done();
    });

    it('uses the paginationHelper to join results', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";

        var calledWith = [];
        var returns = [
            { Things: [1,2,3], NextMarker: marker1 },
            { Things: [4,5,6], NextMarker: marker2 },
            { Things: [7,8,9] }
        ];

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (opts, cb) {
                calledWith.push(opts);
                cb(null, returns.shift());
            }
        };

        var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Things");
        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {}, paginationHelper)
            .then(function (data) {
                assert.deepEqual([1,2,3,4,5,6,7,8,9], data.Things);
                mochaDone();
            }).done();
    });

});
