import { Types } from 'mongoose';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';
import { Withdraw } from './Withdraw.model';
import { IWithdrawRequest } from './withdraw.inteface';
import { Wallet } from './../wallet/wallet.model';

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
  const result = await Withdraw.find()
    .populate('user', '_id fullName email')
    .lean();

  // Mask cardId
  const maskedResult = result.map(item => {
    const cardId: string = item.cardId || '';
    const last4: string = cardId.slice(-4);
    const maskedCard: string = `xxxx xxxx xxxx ${last4}`;
    return {
      ...item,
      cardId: maskedCard,
    };
  });

  return maskedResult;
};

const sendWithdrawRequest = async (
  user: JwtPayload,
  payload: IWithdrawRequest
) => {
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

  const wallet = await Wallet.findOne({ user: isExistsUser?._id });
  if (!wallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found');
  }
  // Validate wallet account (cardId)
  const selectedAccount: any = wallet?.walletAccounts.find(
    acc => acc?.cardNumber.toString() === payload?.cardId.toString()
  );

  if (!selectedAccount) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Selected wallet account not found'
    );
  }

  // Check sufficient balance
  if (wallet?.balance < payload?.amount) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient wallet balance');
  }

  // Calculate profit (%)
  const profitPercent: number = wallet?.profitCharge || 0;
  const profitRate: number = profitPercent / 100;
  const profitAmount: number = Number(payload?.amount) * profitRate;
  const mainAmount: number = Number(payload?.amount) - profitAmount;

  const withdrawData: IWithdrawRequest = {
    user: isExistsUser?._id,
    wallet: wallet?._id,
    cardId: payload?.cardId,
    amount: mainAmount,
    profitCharge: wallet?.profitCharge || 0,
  };

  // Create Withdraw Request
  const result = await Withdraw.create(withdrawData);

  return withdrawData;
};

const acceptWithdrawRequest = async (user: JwtPayload, withdrawId: string) => {
  const isExistsAdmin = await User.findOne({ role: user?.role });
  if (!isExistsAdmin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }

  const adminWallet = await Wallet.findOne({ user: isExistsAdmin?._id });
  if (!adminWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin wallet not found');
  }

  const withdraw = await Withdraw.findById(withdrawId);
  if (!withdraw) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Withdraw request not found');
  }

  const providerWallet = await Wallet.findOne({ user: withdraw?.user });
  if (!providerWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Provider wallet not found');
  }

  const withdrawalRequestBalance: number = withdraw?.amount;

  const adminWalletBalance: number = adminWallet?.balance;

  if (adminWalletBalance < withdrawalRequestBalance) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Insufficient admin wallet balance'
    );
  }

  // Update admin wallet
  adminWallet.balance -= withdrawalRequestBalance;
  adminWallet.transactions.push({
    user: new Types.ObjectId(withdraw?.user),
    balance: -withdrawalRequestBalance,
    createdAt: new Date(),
  });
  await adminWallet.save();

  // Update provider wallet
  providerWallet.balance -= withdrawalRequestBalance;
  providerWallet.transactions.push({
    user: new Types.ObjectId(isExistsAdmin?._id),
    balance: -withdrawalRequestBalance,
    createdAt: new Date(),
  });
  await providerWallet.save();
};

export const WithdrawService = {
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
