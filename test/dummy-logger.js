const _ = require('underscore');
module.exports = {
  error(msg) {
    console.log(msg);
  },
  warn: _.noop,
  info: _.noop,
  debug: _.noop,
  trace: _.noop,
  wrapModule: _.identity,
  wrapFunction: _.identity,
};
