"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function httpPost(url, form, customHeaders, callback, notAPI) {
    var resolveFunc = function () { };
    var rejectFunc = function () { };

    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback && (utils.getType(customHeaders) == "Function" || utils.getType(customHeaders) == "AsyncFunction")) {
      callback = customHeaders;
      customHeaders = {};
    }

    customHeaders = customHeaders || {};

    callback = callback || function (err, data) {
      if (err) return rejectFunc(err);
      resolveFunc(data);
    };

    if (notAPI) {
      utils
        .post(url, ctx.jar, form, ctx.globalOptions, ctx, customHeaders)
        .then(function (resData) {
          callback(null, resData.body.toString());
        })
        .catch(function (err) {
          log.error("httpPost", err);
          return callback(err);
        });
    } else {
      defaultFuncs
        .post(url, ctx.jar, form, {}, customHeaders)
        .then(function (resData) {
          callback(null, resData.body.toString());
        })
        .catch(function (err) {
          log.error("httpPost", err);
          return callback(err);
        });
    }

    return returnPromise;
  };
};
