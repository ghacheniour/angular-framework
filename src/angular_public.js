'use strict';
var setupModuleLoader = require('./loader');
var createInjector = require('../src/injector');

function publishExternalAPI() {
    setupModuleLoader(window);
    var ngModule = window.angular.module('ng', []);
    ngModule.provider('$filter', require('./filter'));
}

module.exports = publishExternalAPI;

