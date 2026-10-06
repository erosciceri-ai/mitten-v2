const base = require('../../jest.config.base.cjs');
module.exports = {
  ...base,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  passWithNoTests: true,
  moduleNameMapper: {
    '^@mitten/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@mitten/contracts/(.*)$': '<rootDir>/../../packages/contracts/src/$1.ts',
  },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { useESM: false }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@mitten/contracts)/)'
  ],
  extensionsToTreatAsEsm: [],
};
