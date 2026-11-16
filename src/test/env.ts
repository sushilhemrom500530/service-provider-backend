/**
 * Runs before any test file is loaded.
 * dotenv never overrides variables that are already set, so these values win
 * over .env: the production database / Stripe / AWS / SMTP are never used.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URL = 'mongodb://127.0.0.1:1/never-use-in-tests';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_tests';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy_for_tests';
process.env.STRIPE_CURRENCY = 'eur';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'eu-north-1';
process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_USERNAME = 'test';
process.env.SMTP_PASSWORD = 'test';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.TZ = 'UTC';
