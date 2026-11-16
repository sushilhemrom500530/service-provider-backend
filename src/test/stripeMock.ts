/**
 * In-memory fake of the parts of Stripe the backend uses.
 * PaymentIntents are created as "requires_payment_method"; a test marks one
 * paid with `payIntent(id)` (what the mobile payment sheet does for real).
 */
type FakeIntent = {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  client_secret: string;
  metadata: Record<string, string>;
};

const intents = new Map<string, FakeIntent>();
const refunds: { id: string; payment_intent: string; amount?: number }[] = [];
let counter = 0;

export const stripeMock = {
  paymentIntents: {
    create: jest.fn(async (params: any) => {
      counter += 1;
      const id = `pi_test_${counter}`;
      const intent: FakeIntent = {
        id,
        object: 'payment_intent',
        amount: params.amount,
        amount_received: 0,
        currency: params.currency,
        status: 'requires_payment_method',
        client_secret: `${id}_secret_test`,
        metadata: { ...(params.metadata || {}) },
      };
      intents.set(id, intent);
      return { ...intent };
    }),
    retrieve: jest.fn(async (id: string) => {
      const intent = intents.get(id);
      if (!intent) {
        const err: any = new Error(`No such payment_intent: '${id}'`);
        err.type = 'StripeInvalidRequestError';
        err.statusCode = 404;
        throw err;
      }
      return { ...intent };
    }),
  },
  refunds: {
    create: jest.fn(async (params: any) => {
      counter += 1;
      const refund = {
        id: `re_test_${counter}`,
        payment_intent: params.payment_intent,
        amount: params.amount,
      };
      refunds.push(refund);
      return { ...refund, status: 'succeeded' };
    }),
  },
  webhooks: {
    constructEvent: jest.fn((body: any) =>
      typeof body === 'string' || Buffer.isBuffer(body) ? JSON.parse(String(body)) : body,
    ),
  },
};

/** Simulate the customer completing the payment sheet */
export const payIntent = (id: string) => {
  const intent = intents.get(id);
  if (!intent) throw new Error(`unknown intent ${id}`);
  intent.status = 'succeeded';
  intent.amount_received = intent.amount;
  return intent;
};

export const getIntent = (id: string) => intents.get(id);
export const getRefunds = () => [...refunds];

export const resetStripeMock = () => {
  intents.clear();
  refunds.length = 0;
  stripeMock.paymentIntents.create.mockClear();
  stripeMock.paymentIntents.retrieve.mockClear();
  stripeMock.refunds.create.mockClear();
};
