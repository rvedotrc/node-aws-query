var Executor = function (max) {
    this.queue = [];
    this.running = 0;
    this.max = 0 + max;
    if (this.max < 1) {
        throw new Error("Attempt to create Executor with max < 1");
    }
};

Executor.prototype.inspect = function () {
    return {
        queue: this.queue.length,
        running: this.running,
        max: this.max
    };
};

Executor.prototype.toString = function () {
    return "Executor" + JSON.stringify(this.inspect());
};

Executor.prototype.submit = function (job) {
    this.queue.push(job);
    if (this.running < this.max) {
        ++this.running;
        var executor = this;
        process.nextTick(function () {
            executor.runNextJob();
        });
    }
};

Executor.prototype.runNextJob = function () {
    if (this.queue.length === 0) {
        --this.running;
        return;
    }

    var f = this.queue.shift();
    var executor = this;

    try {
        f(function () {
            executor.runNextJob();
        });
    } catch (error) {
        this.runNextJob();
    }
};

module.exports = Executor;
