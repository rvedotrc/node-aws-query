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
        var refuses = function(arg) {
            assert.throws(function () {
                new Executor(arg);
            }, /Attempt to create Executor with max < 1/);
        };
        refuses(0);
        refuses(0.9);
        refuses(null);
        refuses(NaN);
        refuses('x');
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
            // 1. First job is running
            assertCounts(e, 0, 1, 1);

            e.submit(function (nextJob2) {
                // 3. First job has completed; second job is running
                assertCounts(e, 0, 1, 1);

                setTimeout(function () {
                    // 4. All done
                    assertCounts(e, 0, 0, 1);
                    mochaDone();
                }, 5);

                nextJob2();
            });

            // 2. Second job is waiting; first job is running
            assertCounts(e, 1, 1, 1);
            nextJob();
        });
    });

    it("runs jobs in parallel", function (mochaDone) {
        var e = new Executor(2);

        e.submit(function (nextJob) {
            // 1. First job is running
            assertCounts(e, 0, 1, 2);

            e.submit(function (nextJob2) {
                // 3. Both jobs are running
                assertCounts(e, 0, 2, 2);
                nextJob2();
            });

            // 2. Second job is queued (but will start imminently); first job
            // is running
            assertCounts(e, 1, 1, 2);
            // First job ends in a while
            setTimeout(nextJob, 10);
        });

        setTimeout(function () {
            // 4. All done
            assertCounts(e, 0, 0, 2);
            mochaDone();
        }, 20);
    });

    it('assumes the callback will never be called (therefore, moves on to the next job) if the function throws', function (mochaDone) {
        var e = new Executor(1);

        e.submit(function (nextJob) {
            // 1. First job is running
            assertCounts(e, 0, 1, 1);

            e.submit(function (nextJob2) {
                // 4. Second job is running
                assertCounts(e, 0, 1, 1);
                nextJob2();
                mochaDone();
            });

            // 2. Second job is queued; first job is running
            assertCounts(e, 1, 1, 1);

            // 3. First job crashes before returning
            throw new Error('bang');
            // nextJob not called
        });
    });

    it('starts new runners as required', function (mochaDone) {
        var e = new Executor(2);

        // A job that takes ~ 10ms to run
        var job = function (nextJob) {
            setTimeout(nextJob, 10);
        };

        e.submit(job);
        e.submit(job);

        setTimeout(function () {
            // 1. At +5ms, jobs 1 & 2 are running
            assertCounts(e, 0, 2, 2);

            setTimeout(function () {
                // 2. At +15ms, nothing is running (jobs 1 & 2 ended at +10ms)
                assertCounts(e, 0, 0, 2);

                // 3. Submit a job; a runner should start
                e.submit(job);

                setTimeout(function () {
                    // 4. At +20ms, job 3 should be running
                    assertCounts(e, 0, 1, 2);

                    setTimeout(function () {
                        // 5. At +30ms, nothing is running (job 3 ended at +25ms)
                        assertCounts(e, 0, 0, 2);
                        mochaDone();
                    }, 10);
                }, 5);

            }, 10);

        }, 5);
    });

    it('allows an optional argument to be submitted', function (mochaDone) {
        var e = new Executor(1);

        var arr = [];
        var f1 = function (nextJob, arg) { arr.push([ "f1", arg ]); nextJob(); };
        var f2 = function (nextJob, arg) { arr.push([ "f2", arg ]); nextJob(); };

        e.submit(f1);
        e.submit(f1, {test: 'args'});
        e.submit(f2, ['more testing']);
        e.submit(f2, ['extra arguments'], 'are ignored');

        setTimeout(function () {
            arr.length.should.eql(4);
            arr[0].should.eql(['f1', undefined]);
            arr[1].should.eql(['f1', {test: 'args'}]);
            arr[2].should.eql(['f2', ['more testing']]);
            arr[3].should.eql(['f2', ['extra arguments']]);
            mochaDone();
        }, 10);
    });

});

