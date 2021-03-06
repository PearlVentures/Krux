var fs = require('fs'),
  _path = require('path'),
  crypto = require('crypto'),
  util = require('util'),
  crux = require('../../index.js'),
  underscore = require('underscore');
/*
 * Utility functions that can be used everywhere
 * */

/**
 * The popular utility module underscore (LoDash) has been conveniently loaded and globalized, to be accessible
 * anywhere in the project, using global['_'] or just _. For more information visit
 * {@link https://lodash.com/}
 * @global
 * */
var _ = underscore;
global['_'] = _;
/*
* Check if we have a SQL error
* */
_['isSqlError'] = function IsSqlError(err) {
  if(typeof err !== 'object' || err === null) return false;
  if(typeof err['sqlState'] === 'undefined') return false;
  return true;
};

/*
* Check if we have a Crux component.
* */
_['isCruxComponent'] = function IsCruxComponent(obj) {
  if(typeof obj !== 'object') return false;
  if(obj.__type === 'CruxComponent') return true;
  return false;
};
_['isCruxService'] = function isCruxService(obj) {
  if(typeof obj !== 'object') return false;
  if(obj.__type === 'CruxService') return true;
  return false;
};



/*
* We create an utility function that can allow us to clone functions.
* WARNING: this should ONLY be used in functions that are called rarely in the application, and not where speed is critical
* */
Function.prototype.cloneFunction = function() {
  var that = this;
  var temp = function () { return that.apply(this, arguments); };
  for(var key in this) {
    if (this.hasOwnProperty(key)) {
      temp[key] = this[key];
    }
  }
  return temp;
};

/*
 * Performs regular util inheritance, with the exception that it will not override old functions,
 * but it will add them a _ at the end
 * ex:
 *   init() in source, will become init_() in target. We do that by using __defineSetter__
 * */
crux.extends = function CruxProtoInheritance(source, target) {
  if(!target || typeof target.prototype !== 'object') {
    throw new Error('Crux.extends: target is not a function');
  }
  if(!source || typeof source.prototype !== 'object') {
    throw new Error('Crux.extends: source is not a function');
  }
  util.inherits(source, target);
  _.forEach(target.prototype, function(a, fName) {
    if(typeof target.prototype[fName] !== 'function') return;
    var extendedFunc = target.prototype[fName];
    Object.defineProperty(source.prototype, fName, {
      enumerable: true,
      configurable: true,
      get: function Extended() {
        return extendedFunc;
      },
      set: function(fVal) {
        // We first check if we've had any previous values on the function.
        var parentFuncName = buildName(source.super_.prototype, fName);
        this[parentFuncName] = source.super_.prototype[fName];
        extendedFunc = fVal;
      }
    });
  });
};


function buildName(obj, name) {
  while(typeof obj[name] !== 'undefined') {
    name += '_';
  }
  return name;
}