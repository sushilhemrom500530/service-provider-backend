import { Types } from 'mongoose';
import { Wallet } from './wallet.model';

export const updateOrCreateWallet = async (ownerId: string, amount: number) => {
  const wallet = await Wallet.findOne({ user: ownerId });
  console.log('wallet is =====>', wallet);
  if (!wallet) {
    // Wallet does not exist → create new
    const newWallet = await Wallet.create({
      user: new Types.ObjectId(ownerId),
      balance: amount,
      transactions: [
        {
          user: new Types.ObjectId(ownerId),
          balance: amount,
          createdAt: new Date(),
        },
      ],
    });
    return newWallet;
  } else {
    wallet.balance += amount;

    // Add new transaction
    wallet.transactions.push({
      user: new Types.ObjectId(ownerId),
      balance: amount,
      createdAt: new Date(),
    });

    await wallet.save();
    return wallet;
  }
};
