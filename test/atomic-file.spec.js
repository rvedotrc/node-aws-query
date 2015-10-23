var Q = require("q");
var assert = require("assert");
var fs = require("fs");
require("should");
var sinon = require("sinon");

var AtomicFile = require("../atomic-file");
var TreeMaker = require('../tree-maker');

describe("AtomicFile", function () {

    var filename = "x/y/foo.txt";
    var tmpFile = filename + ".tmp";
    var content = "some content";
    var anError = { some: 'error' };

    var sandbox;
    var m;
    var treeMakerMock;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        m = sandbox.mock(fs);
        treeMakerMock = sandbox.mock(TreeMaker);
        treeMakerMock.expects("mkpath").withArgs("x/y").returns(Q(true));
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('returns a promise to write content to a file', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(null);
        m.expects("rename").once().withArgs(tmpFile, filename).yields(null);
        m.expects("unlink").never();

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .then(function (data) {
                data.should.eql(content);
                m.verify();
                mochaDone();
            }).done();
    });

    it('handles writeFile failure', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(anError);
        m.expects("rename").never();
        m.expects("unlink").once().withArgs(tmpFile).yields(null);

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .fail(function (data) {
                data.should.eql(anError);
                mochaDone();
            }).done();
    });

    it('handles writeFile failure (unlink fails)', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(anError);
        m.expects("rename").never();
        m.expects("unlink").once().withArgs(tmpFile).yields('ignore me');

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .fail(function (data) {
                data.should.eql(anError);
                mochaDone();
            }).done();
    });

    it('handles rename failure', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(null);
        m.expects("rename").once().withArgs(tmpFile, filename).yields(anError);
        m.expects("unlink").once().withArgs(tmpFile).yields(null);

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .fail(function (data) {
                data.should.eql(anError);
                mochaDone();
            }).done();
    });

    it('handles rename failure (unlink fails)', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(null);
        m.expects("rename").once().withArgs(tmpFile, filename).yields(anError);
        m.expects("unlink").once().withArgs(tmpFile).yields('ignore me');

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .fail(function (data) {
                data.should.eql(anError);
                mochaDone();
            }).done();
    });

    it('creates the directory first', function (mochaDone) {
        m.expects("writeFile").once().withArgs(tmpFile, content, {flag: 'w'}).yields(null);
        m.expects("rename").once().withArgs(tmpFile, filename).yields(null);

        // TODO we're not actually testing that the TreeMaker is called
        // *first*

        return Q(content)
            .then(AtomicFile.saveContentTo(filename))
            .then(function (data) {
                m.verify();
                treeMakerMock.verify();
                mochaDone();
            }).done();
    });

});
