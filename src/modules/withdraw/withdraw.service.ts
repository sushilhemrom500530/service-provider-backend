import mongoose, { Types } from 'mongoose';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes'; 
import { Wallet } from './../wallet/wallet.model';
import { generateTransactionId } from './../../utils/generateTransactionId';
import { JwtPayload } from 'jsonwebtoken';
import { WalletTransactionType } from './../wallet/wallet.interface'
import { Withdraw } from './withdraw.model';
import { IWithdraw } from './withdraw.inteface';
import { Notification } from './../notification/notification.model';


const getAllFromDB = async (query: any) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const match: any = {};
  if (query.status) {
    match.status = { $regex: query.status, $options: 'i' };
  };

  // Build search regex
  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    const searchOr: any[] = [
      { 'user.email': searchRegex },
      { 'user.fullName': searchRegex },
    ];

    // _id search only if valid ObjectId
    if (query.search.match(/^[0-9a-fA-F]{24}$/)) {
      searchOr.push({ _id: new mongoose.Types.ObjectId(query.search) });
    }

    match.$or = searchOr;
  }

  const aggregate = Withdraw.aggregate()
    .lookup({
      from: 'users', // collection name
      localField: 'user',
      foreignField: '_id',
      as: 'user',
    })
    .unwind('$user')
    .match(match)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const result: any = await aggregate.exec();

  // total count
  const totalAgg = Withdraw.aggregate()
    .lookup({
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'user',
    })
    .unwind('$user')
    .match(match);

  const totalResult: any = await totalAgg.exec();

  const maskedResult = result.map((item: any) => {
    const cardId: string = item.cardId || '';
    const last4: string = cardId.slice(-4);
    return {
      ...item,
      cardId: last4 ? `xxxx xxxx xxxx ${last4}` : '',
    };
  });

  return {
    pagination: {
      total: totalResult.length,
      page,
      limit,
      totalPages: Math.ceil(totalResult.length / limit),
    },
    withdrawals: maskedResult,
  };
};




const sendWithdrawRequest = async (
  user: JwtPayload,
  payload: IWithdraw
) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  if (isExistsUser.role !== 'Provider')
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers can withdraw funds'
    );

  const adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }
  const ownerId = adminUser?._id || '';

  const wallet = await Wallet.findOne({ user: isExistsUser._id });
  if (!wallet) throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found');

  const selectedAccount = wallet?.walletAccounts?.find(
    acc => acc?.cardNumber.toString() === payload?.cardId.toString()
  );
  if (!selectedAccount)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Selected wallet account not found'
    );
  if (wallet?.balance < payload.amount)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient wallet balance');

  const withdrawData: Partial<IWithdraw> = {
    user: isExistsUser?._id,
    wallet: wallet?._id,
    cardId: payload?.cardId,
    amount: payload?.amount,
    transactionId: generateTransactionId('WD'),
    profitCharge: wallet?.profitCharge || 0,
  };
  // create notification
  await Notification.create({
    title: 'Withdrawal Request',
    description: 'You have a new withdrawal request',
    receiverId: ownerId,
    type: 'withdrawal',
    isRead: false,
    senderId: isExistsUser?._id,
  })

  const result = await Withdraw.create(withdrawData);
  return result;
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

  if (withdraw?.status === 'Paid') {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Withdraw request already paided'
    );
  }

  const providerWallet = await Wallet.findOne({ user: withdraw?.user });
  if (!providerWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Provider wallet not found');
  }
  // Calculate profit and withdrawal amount
  const profitRate: number = (adminWallet?.profitCharge || 0) / 100;
  const profitAmount: number = withdraw.amount * profitRate;
  const withdrawalAmount: number = withdraw.amount - profitAmount;

  //  Check admin balance
  if (adminWallet.balance < withdrawalAmount) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Insufficient admin wallet balance'
    );
  }

  // Update admin wallet 
  adminWallet.balance -= withdrawalAmount;
  adminWallet.transactions.push({
    user: new Types.ObjectId(withdraw?.user),
    balance: -withdrawalAmount,
    type: WalletTransactionType.WITHDRAW,
    createdAt: new Date(),
  });

  // Update provider wallet 
  providerWallet.balance -= withdraw?.amount;
  providerWallet.transactions.push({
    user: new Types.ObjectId(isExistsAdmin?._id),
    balance: withdraw?.amount,
    type: WalletTransactionType.WITHDRAW,
    createdAt: new Date(),
  });

  // Save both wallets
  await adminWallet.save();
  await providerWallet.save();

  withdraw.status = 'Paid';
  await withdraw.save();

  // create notification
  await Notification.create({
    title: 'Accepted Withdrawal Request',
    description: 'Your withdrawal request has been accepted',
    receiverId: providerWallet?.user,
    type: 'withdrawal',
    isRead: false,
    senderId: isExistsAdmin?._id,
  })

  return withdraw;
};

export const WithdrawService = {
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
