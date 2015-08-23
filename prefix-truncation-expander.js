var Q = require('q');

var PrefixTruncationExpander = function (fetcher, nameResolver, alphabet, maxResults) {
    this.fetcher = fetcher;
    this.nameResolver = nameResolver;
    this.alphabet = alphabet;
    this.maxResults = maxResults;
};

PrefixTruncationExpander.prototype.expand = function (prefix) {
    var expander = this;
    if (prefix === undefined) prefix = "";

    return this.fetcher(prefix)
        .then(function (r) {
            if (r.length < expander.maxResults) return r;

            var lastResult = r[r.length-1];
            var lastName = expander.nameResolver(lastResult);

            // If prefix = "foo"
            // and the last result we have is "foolish"
            // then to discover things later than this, we have to use a longer prefix
            // then "foo":
            // - "foom", "foon" (etc, for all possible character after "l"), each of
            // which must be iterated independently
            // - but for "fool"... we can try "fool" (which will certainly return some
            // results we already have), and _may_ return additional results

            // So the results we need are:
            // - the ones we already have
            // - plus the "fool" cases (minus the ones we already have)
            // - plus the "foom", "foon" ... cases

            var promises = [ Q(r) ];

            var problematicLetter = lastName[prefix.length];

            // The fool case
            var foolPromise = expander.expand(prefix + problematicLetter)
                .then(function (foolNames) {
                    var indexOfLastResult = foolNames.indexOf(lastResult); // assumes they are just strings
                    return foolNames.slice(indexOfLastResult+1);
                });
            promises.push(foolPromise);

            // The foom, foon... case
            var problematicIndex = expander.alphabet.indexOf(problematicLetter);
            for (var i=problematicIndex+1; i<expander.alphabet.length; ++i) {
                promises.push(expander.expand(prefix + expander.alphabet[i]));
            }

            return Q.all(promises)
                .then(function (multiResults) {
                    var arr = [];
                    return arr.concat.apply(arr, multiResults);
                });
        });
};

module.exports = PrefixTruncationExpander;
