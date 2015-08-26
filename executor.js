var Executor = function (max) {
    this.queue = [];
    this.running = 0;
    this.max = Math.floor(0 + max);
    if (this.max <= 0 || !Number.isFinite(this.max)) {
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

Executor.prototype.submit = function (job, arg) {
    this.queue.push([job, arg]);
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

    var functionAndArg = this.queue.shift();
    var executor = this;

    try {
        functionAndArg[0](function () {
            executor.runNextJob();
        }, functionAndArg[1]);
    } catch (error) {
        this.runNextJob();
    }
};

module.exports = Executor;
