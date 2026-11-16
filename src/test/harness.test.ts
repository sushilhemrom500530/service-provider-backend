import mongoose from 'mongoose';
import { api, makeCustomer } from './factories';

describe('test harness', () => {
  it('uses an in-memory database, never the .env one', () => {
    const host = (mongoose.connection as any).host;
    expect(['127.0.0.1', 'localhost']).toContain(host);
    expect(process.env.MONGODB_URL).toContain('never-use-in-tests');
  });

  it('serves health and the standard 404 envelope', async () => {
    const res = await api().get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });

  it('authenticates a factory user', async () => {
    const u = await makeCustomer();
    const res = await api().get('/api/v1/notifications/all').set(...u.auth);
    expect(res.status).not.toBe(401);
  });
});
