import { Types } from 'mongoose';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';
import { Withdraw } from './Withdraw.model';
import { IWithdrawRequest } from './withdraw.inteface';

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

const getAllFromDB = async user => {
  const isExistsAdmin = await User.findOne({ role: user?.role });
  if (!isExistsAdmin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }

  const result = await Withdraw.find();

  return result;
};

const sendWithdrawRequest = async (user, payload: IWithdrawRequest) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (isExistsUser.role !== 'Provider') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers can withdraw funds'
    );
  }

  const wallet = await Wallet.findOne({ user: isExistsUser._id });
  if (!wallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found');
  }

  // Validate wallet account (cardId)
  const selectedAccount = wallet.walletAccounts.find(
    acc => acc.cardNumber.toString() === payload.cardId.toString()
  );

  if (!selectedAccount) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Selected wallet account not found'
    );
  }
 

  // Check sufficient balance
  if (wallet.balance < payload.amount) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient wallet balance');
  }

  const withdrawData = {
    user: isExistsUser?._id,
    wallet: wallet?._id,
    cardId: payload?.cardId,
    amount: payload?.amount,
    profitCharge: 0,
    status: 'Pending',
    note: payload.note || '',
  };

  // Create Withdraw Request
  const result = await Withdraw.create();

  return result;
};

export const WithdrawService = {
  getAllFromDB,
  sendWithdrawRequest,
};
