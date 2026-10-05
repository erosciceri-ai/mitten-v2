const base = require('../../jest.config.base.js');
module.exports = {
  ...base,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  passWithNoTests: true,
};
