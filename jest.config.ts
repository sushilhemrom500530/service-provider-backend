// Tests run ONLY against an in-memory MongoDB (src/test/setup.ts).
// src/test/env.ts runs first and overrides MONGODB_URL so the production
// database in .env can never be reached from a test.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  setupFiles: ['<rootDir>/src/test/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/test/**',
    '!src/scripts/**',
    '!src/**/*.interface.ts',
  ],
  coverageDirectory: 'coverage',
  testTimeout: 60000,
};
