var assert = require("assert");
require("should");

var Executor = require("../executor");

describe("Executor", function () {

    var assertCounts = function (executor, queue, running, max) {
        var state = executor.inspect();
        state.queue.should.eql(queue);
        state.running.should.eql(running);
        state.max.should.eql(max);
    };

    it("stringifies", function () {
        var e = new Executor(5);
        e.toString().should.eql('Executor{"queue":0,"running":0,"max":5}');
    });

    it("refuses to start if max < 1", function () {
        assert.throws(function () {
            new Executor(0);
        }, /Attempt to create Executor with max < 1/);
    });

    it("runs a job", function (mochaDone) {
        var e = new Executor(5);

        e.submit(function (nextJob) {
            assertCounts(e, 0, 1, 5);
            nextJob();
        });

        setTimeout(function () {
            assertCounts(e, 0, 0, 5);
            mochaDone();
        }, 25);
    });

    it("runs jobs in series", function (mochaDone) {
        var e = new Executor(1);

        e.submit(function (nextJob) {
            assertCounts(e, 0, 1, 1);

            e.submit(function (nextJob2) {
                assertCounts(e, 0, 1, 1);
                nextJob2();
            });

            assertCounts(e, 1, 1, 1);
            nextJob();
        });

        setTimeout(function () {
            assertCounts(e, 0, 0, 1);
            mochaDone();
        }, 50);
    });

    it("runs jobs in parallel", function (mochaDone) {
        var e = new Executor(2);

        e.submit(function (nextJob) {
            assertCounts(e, 0, 1, 2);

            e.submit(function (nextJob2) {
                assertCounts(e, 0, 2, 2);
                nextJob2();
            });

            assertCounts(e, 1, 1, 2);
            setTimeout(nextJob, 10);
        });

        setTimeout(function () {
            assertCounts(e, 0, 0, 2);
            mochaDone();
        }, 20);
    });

    it('assumes the callback will never be called (therefore, moves on to the next job) if the function throws', function (mochaDone) {
        var e = new Executor(1);

        e.submit(function (nextJob) {
            assertCounts(e, 0, 1, 1);

            e.submit(function (nextJob2) {
                assertCounts(e, 0, 1, 1);
                nextJob2();
                mochaDone();
            });

            assertCounts(e, 1, 1, 1);

            throw new Error('bang');
            // nextJob not called
        });
    });

    it('starts new runners as required', function (mochaDone) {
        var e = new Executor(2);

        var job = function (nextJob) {
            setTimeout(nextJob, 10);
        };

        e.submit(job);
        e.submit(job);

        setTimeout(function () {
            assertCounts(e, 0, 2, 2);

            setTimeout(function () {
                assertCounts(e, 0, 0, 2);

                e.submit(job);
                setTimeout(function () {
                    assertCounts(e, 0, 1, 2);

                    setTimeout(function () {
                        assertCounts(e, 0, 0, 2);
                        mochaDone();
                    }, 20);
                }, 5);

            }, 20);

        }, 5);
    });

});

