var assert = require("assert");
require("should");
var sinon = require("sinon");

var AwsDataUtils = require("../aws-data-utils");

describe("AwsDataUtils", function () {

    it('returns a promise to fetch data from AWS', function (mochaDone) {
        var anAwsClient = {
            getThings: function (args, cb) {
                           args.should.eql({"ThingName": "bob"});
                           cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ] });
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "Foo", "getThings", {"ThingName": "bob"})
            .then(function (data) {
                console.log("got data", data);
                mochaDone();
            }).done();
    });

    it('fails if the result is truncated but no listKey is provided', function (mochaDone) {
        var anAwsClient = {
            getThings: function (args, cb) {
                           cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ], IsTruncated: true });
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "Foo", "getThings", {})
            .fail(function (err) {
                console.log("got err", err);
                err.should.match(/response IsTruncated, but has no Marker/);
                mochaDone();
            }).done();
    });

    it('paginates if the result is truncated and a listKey is provided', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";
        var anAwsClient = {
            getThings: function (args, cb) {
                           if (args.Marker === undefined) {
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ], IsTruncated: true, Marker: marker1 });
                           } else if (args.Marker === marker1) {
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "yyy" } ], IsTruncated: true, Marker: marker2 });
                           } else if (args.Marker === marker2) {
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "zzz" } ] });
                           }
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "Foo", "getThings", {}, "Things")
            .then(function (data) {
                console.log("got data", data);
                data.Things.length.should.eql(3);
                data.Things[0].ThingId.should.eql('xxx');
                data.Things[1].ThingId.should.eql('yyy');
                data.Things[2].ThingId.should.eql('zzz');
                mochaDone();
            }).done();
    });

    it('preserves arguments when paginating', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";
        var anAwsClient = {
            getThings: function (args, cb) {
                           if (args.Marker === undefined) {
                               args.should.eql({"ThingName": "bob"});
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ], IsTruncated: true, Marker: marker1 });
                           } else if (args.Marker === marker1) {
                               args.should.eql({"ThingName": "bob", Marker: marker1});
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "yyy" } ], IsTruncated: true, Marker: marker2 });
                           } else if (args.Marker === marker2) {
                               args.should.eql({"ThingName": "bob", Marker: marker2});
                               cb(null, { Things: [ { "ThingName": "bob", "ThingId": "zzz" } ] });
                           }
                       }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "Foo", "getThings", {"ThingName": "bob"}, "Things")
            .then(function (data) {
                console.log("got data", data);
                data.Things.length.should.eql(3);
                data.Things[0].ThingId.should.eql('xxx');
                data.Things[1].ThingId.should.eql('yyy');
                data.Things[2].ThingId.should.eql('zzz');
                mochaDone();
            }).done();
    });

});
