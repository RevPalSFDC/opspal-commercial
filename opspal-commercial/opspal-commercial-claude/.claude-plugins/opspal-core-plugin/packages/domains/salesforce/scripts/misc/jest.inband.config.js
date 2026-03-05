/**
 * Jest Configuration (In-Band) for Gate/Bridge Tests
 */

const base = require('./jest.config');
const { maxWorkers, ...rest } = base;

module.exports = {
  ...rest,
};
