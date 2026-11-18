/**
 * QA Transport report T3: the unread badge of a chat must be the same on the
 * socket ("chat-list") and REST (GET /chat/chat-users).
 */
import { Types } from 'mongoose';
import { api, makeCustomer, makeProvider, TestUser } from '../../test/factories';
import { Chat, Message } from './chat.model';
import { ChatService } from './chat.service';
import { buildChatList } from '../../socket';

const restUnread = async (u: TestUser) => {
  const res = await api().get('/api/v1/chat/chat-users').set(...u.auth);
  expect(res.status).toBe(200);
  return new Map<string, number>(res.body.data.map((c: any) => [String(c.chatId), c.unreadCount]));
};
const socketUnread = async (u: TestUser) =>
  new Map<string, number>((await buildChatList(u.id)).map((c: any) => [String(c.chatId), c.unreadCount]));

const say = (chatId: any, from: TestUser, to: TestUser, content: string, readByReceiver = false) =>
  Message.create({
    chatId,
    sender: from.id,
    receiver: to.id,
    content,
    messageType: 'text',
    readBy: readByReceiver ? [from.id, to.id] : [from.id],
  } as any);

describe('chat unread count (T3)', () => {
  it('socket and REST give the same number, even when the stored counter is wrong', async () => {
    const customer = await makeCustomer();
    const provider = await makeProvider('Transport');
    const chat: any = await Chat.create({ participants: [customer.id, provider.id], chatType: 'private' });
    await say(chat._id, customer, provider, 'Hi', true);
    await say(chat._id, provider, customer, 'Hello', true);
    await say(chat._id, customer, provider, 'Are you there?'); // unread by the provider
    await say(chat._id, customer, provider, 'At 9?'); // unread by the provider
    // a stale counter like the one QA saw (old data / seed): must be ignored
    await Chat.updateOne({ _id: chat._id }, { $set: { unreadCount: { [provider.id]: 1, [customer.id]: 3 } } });

    const id = String(chat._id);
    expect((await restUnread(provider)).get(id)).toBe(2);
    expect((await socketUnread(provider)).get(id)).toBe(2);
    expect((await restUnread(customer)).get(id)).toBe(0);
    expect((await socketUnread(customer)).get(id)).toBe(0);

    // reading the chat clears both
    await ChatService.markMessagesAsRead(id, new Types.ObjectId(provider.id));
    expect((await restUnread(provider)).get(id)).toBe(0);
    expect((await socketUnread(provider)).get(id)).toBe(0);
  });

  it('a message I deleted is not unread; a chat I deleted is in neither list', async () => {
    const customer = await makeCustomer();
    const provider = await makeProvider('Transport');
    const chat: any = await Chat.create({ participants: [customer.id, provider.id], chatType: 'private' });
    const m: any = await say(chat._id, customer, provider, 'One');
    await say(chat._id, customer, provider, 'Two');
    await Message.updateOne({ _id: m._id }, { $addToSet: { deletedBy: provider.id } });
    expect(await ChatService.unreadCounts([chat._id], provider.id)).toEqual(new Map([[String(chat._id), 1]]));

    await Chat.updateOne({ _id: chat._id }, { $addToSet: { deletedBy: provider.id } });
    expect((await restUnread(provider)).has(String(chat._id))).toBe(false);
    expect((await socketUnread(provider)).has(String(chat._id))).toBe(false);
  });

  it('several chats in one query; no chats -> empty', async () => {
    const provider = await makeProvider('Transport');
    const a = await makeCustomer();
    const b = await makeCustomer();
    const c1: any = await Chat.create({ participants: [a.id, provider.id] });
    const c2: any = await Chat.create({ participants: [b.id, provider.id] });
    await say(c1._id, a, provider, 'x');
    await say(c2._id, b, provider, 'y');
    await say(c2._id, b, provider, 'z');
    const counts = await ChatService.unreadCounts([c1._id, c2._id], provider.id);
    expect(counts.get(String(c1._id))).toBe(1);
    expect(counts.get(String(c2._id))).toBe(2);
    expect((await ChatService.unreadCounts([], provider.id)).size).toBe(0);
    expect(await socketUnread(provider)).toEqual(await restUnread(provider));
  });
});
