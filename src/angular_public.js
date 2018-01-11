'use strict';
var setupModuleLoader = require('./loader');
var createInjector = require('../src/injector');

function publishExternalAPI() {
    setupModuleLoader(window);
    var ngModule = window.angular.module('ng', []);
    ngModule.provider('$filter', require('./filter'));
    ngModule.provider('$parse', require('./parse'));
    ngModule.provider('$rootScope', require('./scope'));
    ngModule.provider('$q', require('./q'));
}

module.exports = publishExternalAPI;

