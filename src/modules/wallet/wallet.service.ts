import { Types } from 'mongoose';
import { Wallet } from './wallet.model';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';
import { IWalletAccount } from './wallet.inteface';
import { JwtPayload } from 'jsonwebtoken';

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

  await Wallet.findOneAndUpdate(
    { user: admin._id },
    {
      $inc: { balance: amount },
      $push: {
        transactions: {
          user: new Types.ObjectId(senderId),
          balance: amount,
          createdAt: new Date(),
        },
      },
    },
    { upsert: true, new: true }
  );

  // if (!adminWallet) {
  //   adminWallet = await Wallet.create({
  //     user: admin._id,
  //     balance: amount,
  //     transactions: [
  //       {
  //         user: new Types.ObjectId(senderId),
  //         balance: amount,
  //         createdAt: new Date(),
  //       },
  //     ],
  //   });
  // } else {
  //   adminWallet.balance += amount;
  //   adminWallet.transactions.push({
  //     user: new Types.ObjectId(senderId),
  //     balance: amount,
  //     createdAt: new Date(),
  //   });
  //   await adminWallet.save();
  // }

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

const updateProfit = async (user: JwtPayload, payload: number) => {
  console.log('req data :', payload);

  const isExistsAdmin = await User.findOne({ role: user?.role });
  if (!isExistsAdmin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }

  const adminWallet = await Wallet.findOne({ user: isExistsAdmin._id });
  if (!adminWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin wallet not found');
  }

  const updateWalletProfit = await Wallet.findOneAndUpdate(
    { user: isExistsAdmin._id },
    { $set: { profitCharge: payload } },
    { new: true }
  ).select('-transactions -__v');

  return updateWalletProfit;
};

const addWallet = async (user, payload: IWalletAccount) => {
  const isExistsProvider = await User.findOne({ role: user?.role });
  if (!isExistsProvider) {
    throw new AppError('Provider user not found', StatusCodes.NOT_FOUND);
  }

  // Find the wallet
  let wallet = await Wallet.findOne({ user: '68f8c4c078c729eb1d9dc598' });
  // let wallet = await Wallet.findOne({ user: user._id });

  if (!wallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found');
  }

  // Add the new wallet account
  wallet.walletAccounts.push({
    accountType: payload.accountType,
    cardNumber: payload.cardNumber,
    cardHolderName: payload.cardHolderName,
  });

  // Save the wallet
  await wallet.save();

  return wallet;
};

const getBalanceById = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const result = await Wallet.findOne({ user: isExistsUser?._id }).select(
    '-transactions -__v'
  );

  return result;
};
export const WalletService = {
  updateProfit,
  addWallet,
  getBalanceById,
};
