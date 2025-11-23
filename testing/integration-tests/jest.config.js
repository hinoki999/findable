module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  verbose: true,
  testTimeout: 30000, // 30 seconds for API calls
  bail: false, // Continue running tests even if one fails
  collectCoverage: false,
  coveragePathIgnorePatterns: ['/node_modules/'],
};

