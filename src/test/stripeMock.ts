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
type FakeRefund = {
  id: string;
  payment_intent: string;
  amount?: number; // as requested (undefined = full)
  charged: number; // what Stripe actually refunded (minor units)
  status: string;
  metadata: Record<string, string>;
};
const refunds: FakeRefund[] = [];
const idempotency = new Map<string, FakeRefund>();
let failNextRefund: any = null;
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
    create: jest.fn(async (params: any, opts?: { idempotencyKey?: string }) => {
      // same idempotency key = the same refund (like Stripe)
      const key = opts?.idempotencyKey;
      if (key && idempotency.has(key)) {
        const r = idempotency.get(key)!;
        return { ...r, amount: r.charged };
      }
      if (failNextRefund) {
        const err = failNextRefund;
        failNextRefund = null;
        throw err;
      }
      counter += 1;
      const intent = intents.get(params.payment_intent);
      const done = refunds.filter(r => r.payment_intent === params.payment_intent).reduce((t, r) => t + r.charged, 0);
      const refund: FakeRefund = {
        id: `re_test_${counter}`,
        payment_intent: params.payment_intent,
        amount: params.amount,
        charged: params.amount ?? Math.max(0, (intent?.amount ?? 0) - done),
        status: 'succeeded',
        metadata: { ...(params.metadata || {}) },
      };
      refunds.push(refund);
      if (key) idempotency.set(key, refund);
      return { ...refund, amount: refund.charged };
    }),
    list: jest.fn(async (params: any) => ({
      data: refunds
        .filter(r => r.payment_intent === params?.payment_intent)
        .map(r => ({ ...r, amount: r.charged })),
    })),
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

/** Make the next refunds.create throw this error (e.g. Stripe refuses / unreachable) */
export const failNextRefundWith = (error: any) => {
  failNextRefund = error;
};

export const resetStripeMock = () => {
  intents.clear();
  refunds.length = 0;
  idempotency.clear();
  failNextRefund = null;
  stripeMock.paymentIntents.create.mockClear();
  stripeMock.paymentIntents.retrieve.mockClear();
  stripeMock.refunds.create.mockClear();
};
