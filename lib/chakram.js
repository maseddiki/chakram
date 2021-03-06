/**
Chakram Module
@module chakram
@example
var chakram = require("chakram");
 */

var Q = require('q'),
    extend = require('extend-object'),
    methods = require('./methods.js'),
    chakramMatchers = require("./assertions/index.js"),
    chaiAsPromised,
    chaiShallow = require('chai-shallow-deep-equal'),
    chai;

var exports = module.exports = {};
extend(exports, methods);


exports.initialized = false;

var extendChaiPromise = function () {
    chaiAsPromised.transferPromiseness = function (assertion, promise) {
        assertion.then = promise.then.bind(promise);
        assertion.isFulfilled = promise.isFulfilled.bind(promise);
    };
};

var loadChai = function () {
    if (exports.initialized) {
        delete require.cache[require.resolve('chai-as-promised')];
        delete require.cache[require.resolve('chai')];
    }
    chai = require('chai');
    chaiAsPromised = require("chai-as-promised");
    extendChaiPromise();
};

/**
Initialise the chakram package with custom chai plugins.
Only call if you want to exploit custom plugins.
@param {...ChaiPlugin} customChaiPlugin - One or multiple chai plugins
@alias module:chakram.initialize
@example 
var customProperty = function (chai, utils) {
    utils.addProperty(chai.Assertion.prototype, 'teapot', function () {
        var statusCode = this._obj.response.statusCode;
        this.assert(
            statusCode === 418, 
            'expected status code '+statusCode+' to equal 418', 
            'expected '+statusCode+' to not be equal to 418'
        );
    });
};
chakram.initialise(customProperty);
 */
exports.initialize = function (customChaiPlugin) {
    loadChai();
    for(var ct = 0; ct < arguments.length; ct++) {
        chai.use(arguments[ct]);
    }
    chakramMatchers.map(function(matcher) {
        chai.use(matcher);
    });
    chai.use(chaiShallow);
    chai.use(chaiAsPromised);
    exports.initialized = true;
};

var recordedExpects = [];

/**
Chakram assertion constructor. Extends chai's extend method with Chakram's HTTP assertions.
Please see {@link http://chaijs.com/api/bdd/ chai's API documentation} for details on the default chai assertions and the {@link ChakramExpectation} documentation for the Chakram HTTP assertions.
@param {*} value - The variable to run assertions on, can be a {@link ChakramResponse} promise
@returns {chakram-expectation} A Chakram expectation object
@alias module:chakram.expect
@example 
var expect = chakram.expect;
it("should support chakram and chai assertions", function () {
    var google = chakram.get("http://google.com");
    expect(true).to.be.true;
    expect(google).to.have.status(200);
    expect(1).to.be.below(10);
    expect("teststring").to.be.a('string');
    return chakram.wait();
});
 */
exports.expect = function(value) {
    if(exports.initialized === false) {
        exports.initialize();
    }
    if (value !== undefined && value !== null && value.then !== undefined) {
        var test = chai.expect(value).eventually;
        recordedExpects.push(test);
        return test;
    } else {
        return chai.expect(value);   
    }
};

/**
Returns a promise which is fulfilled once all promises in the provided array are fulfilled.
Identical to {@link https://github.com/kriskowal/q/wiki/API-Reference#promiseall Q.all}.
@method
@param {Promise[]} promiseArray - An array of promises to wait for
@returns {Promise}
@alias module:chakram.all
 */
exports.all = Q.all;

/**
Returns a promise which is fulfilled once all promises in the provided array are fulfilled.
Similar to {@link https://github.com/kriskowal/q/wiki/API-Reference#promiseall Q.all}, however, instead of being fulfilled with an array containing the fulfillment value of each promise, it is fulfilled with the fulfillment value of the last promise in the provided array. This allows chaining of HTTP calls.
@param {Promise[]} promiseArray - An array of promises to wait for
@returns {Promise}
@alias module:chakram.waitFor
@example 
it("should support grouping multiple tests", function () {
    var response = chakram.get("http://httpbin.org/get");
    return chakram.waitFor([
        expect(response).to.have.status(200),
        expect(response).not.to.have.status(404)
    ]);
});
 */
exports.waitFor = function(promiseArray) {
    return Q.all(promiseArray).then(function(resolvedArray) {
        var deferred = Q.defer();
        deferred.resolve(resolvedArray[resolvedArray.length - 1]);
        return deferred.promise;
    });
};

/**
Returns a promise which is fulfilled once all chakram expectations are fulfilled.
This works by recording all chakram expectations called within an 'it' and waits for all the expectations to finish before resolving the returned promise.
@returns {Promise}
@alias module:chakram.wait
@example 
it("should support auto waiting for tests", function() {
    var response = chakram.get("http://httpbin.org/get");
    expect(response).to.have.status(200);
    expect(response).not.to.have.status(404);
    return chakram.wait();
});
 */
exports.wait = function() {
    return exports.waitFor(recordedExpects);
};

var warnUser = function (message) {
    if (this.currentTest.state !== 'failed') {
        this.test.error(new Error(message));
    }
};

var checkForUnfulfilledExpectations = function () {
    for(var ct = 0; ct < recordedExpects.length; ct++) {
        if(recordedExpects[ct].isFulfilled !== undefined && recordedExpects[ct].isFulfilled() === false) {
            warnUser.call(this, "Some expectation promises were not fulfilled before the test finished. Ensure you are waiting for all the expectations to run");
            break;
        }
    }
};

afterEach(function() {
    checkForUnfulfilledExpectations.call(this);
    recordedExpects = [];
});