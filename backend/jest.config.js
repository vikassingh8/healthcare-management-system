module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/seed.js'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
};
