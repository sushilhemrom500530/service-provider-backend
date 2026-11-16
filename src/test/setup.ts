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

// quiet request logging in test output
jest.spyOn(console, 'log').mockImplementation(() => undefined);

// ---------- database ----------
let mongo: MongoMemoryServer;

const assertLocal = (uri: string) => {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri))
    throw new Error(`Refusing to connect tests to a non-local database: ${uri.split('@').pop()}`);
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
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
