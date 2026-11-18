/**
 * Test setup: in-memory MongoDB + mocks for every external service.
 * Nothing here can reach the shared production database, Stripe, S3 or SMTP.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resetStripeMock } from './stripeMock';

// ---------- external services ----------
jest.mock('../utils/stripe', () => ({
  __esModule: true,
  default: require('./stripeMock').stripeMock,
}));

jest.mock('../aws/s3Service', () => {
  let n = 0;
  const upload = jest.fn(async (file: any) => {
    n += 1;
    return `https://test-bucket.s3.amazonaws.com/uploads/${n}-${file?.originalname || 'file'}`;
  });
  return {
    __esModule: true,
    s3Services: {
      uploadSingleFileToS3: upload,
      uploadFilesToS3: jest.fn(async (files: any[]) =>
        Promise.all((files || []).map(f => upload(f))),
      ),
      deleteFileFromS3: jest.fn(async () => true),
    },
  };
});

jest.mock('../modules/emailService/emailService', () => ({
  __esModule: true,
  emailService: new Proxy({}, { get: () => jest.fn(async () => true) }),
}));

jest.mock('../socket/socketEmitter', () => ({
  __esModule: true,
  emitToUserId: jest.fn(),
  SOCKET_BOOKING_UPDATED: 'booking:updated',
  SOCKET_NOTIFICATION_NEW: 'notification:new',
}));

// tests must not write into the real log files (winston/)
jest.mock('../shared/logger', () => {
  const quiet = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { __esModule: true, logger: quiet, errorLogger: quiet };
});

// quiet request logging in test output
jest.spyOn(console, 'log').mockImplementation(() => undefined);

// ---------- database ----------
let mongo: MongoMemoryServer;

const assertLocal = (uri: string) => {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri))
    throw new Error(`Refusing to connect tests to a non-local database: ${uri.split('@').pop()}`);
};

/**
 * Windows (Hyper-V / WinNAT) reserves random TCP ranges; a random port can
 * fail with "listen EACCES". Use a port from a range those don't use, retry.
 */
const startMongo = async () => {
  let lastError: any;
  for (let attempt = 0; attempt < 8; attempt++) {
    const port = 27100 + Math.floor(Math.random() * 800);
    try {
      return await MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1' } });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

beforeAll(async () => {
  mongo = await startMongo();
  const uri = mongo.getUri();
  assertLocal(uri);
  await mongoose.connect(uri);
});

afterEach(async () => {
  resetStripeMock();
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map(c => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
