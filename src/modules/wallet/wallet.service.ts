import { Types } from 'mongoose';
import { Wallet } from './wallet.model';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';

export const updateOrCreateWallet = async (
  ownerId: string, // provider
  senderId: string, // customer
  amount: number
) => {
  // Find admin user
  const admin = await User.findOne({ role: 'Admin' });
  if (!admin) {
    throw new AppError('Admin user not found', StatusCodes.NOT_FOUND);
  }

  // Calculate profit (20%) 
  // const profitPercent = config.adminPayment.profit || 20;
  // const profitRate = profitPercent / 100;
  // const profitAmount = amount * profitRate;
  // const mainAmount = amount - profitAmount;

  //  Update or create admin wallet
  let adminWallet = await Wallet.findOne({ user: admin._id });

  if (!adminWallet) {
    adminWallet = await Wallet.create({
      user: admin._id,
      balance: amount,
      transactions: [
        {
          user: new Types.ObjectId(senderId),
          balance: amount,
          createdAt: new Date(),
        },
      ],
    });
  } else {
    adminWallet.balance += amount;
    adminWallet.transactions.push({
      user: new Types.ObjectId(senderId),
      balance: amount,
      createdAt: new Date(),
    });
    await adminWallet.save();
  }

  // Update or create provider wallet
  let providerWallet = await Wallet.findOne({ user: ownerId });

  if (!providerWallet) {
    providerWallet = await Wallet.create({
      user: new Types.ObjectId(ownerId),
      balance: amount,  
      transactions: [
        {
          user: new Types.ObjectId(senderId),
          balance: amount,
          createdAt: new Date(),
        },
      ],
    });
  } else {
    providerWallet.balance += amount;
    providerWallet.transactions.push({
      user: new Types.ObjectId(senderId),
      balance: amount,
      createdAt: new Date(),
    });
    await providerWallet.save();
  }

  return { adminWallet, providerWallet };
};
