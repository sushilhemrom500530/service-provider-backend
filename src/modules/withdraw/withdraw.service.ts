import { Types } from 'mongoose';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';  
import { Wallet } from './../wallet/wallet.model';
import { generateTransactionId } from './../../utils/generateTransactionId';
import { v4 as uuidv4 } from 'uuid';
import { JwtPayload } from 'jsonwebtoken';
import {WalletTransactionType} from './../wallet/wallet.interface'
import { Withdraw } from './withdraw.model';
import { IWithdraw } from './withdraw.inteface';

// export const updateOrCreateWallet = async (
//   ownerId: string, // provider
//   senderId: string, // customer
//   amount: number
// ) => {
//   // Find admin user
//   const admin = await User.findOne({ role: 'Admin' });
//   if (!admin) {
//     throw new AppError('Admin user not found', StatusCodes.NOT_FOUND);
//   }

//   //  Update or create admin wallet
//   let adminWallet = await Wallet.findOne({ user: admin._id });

//   if (!adminWallet) {
//     adminWallet = await Wallet.create({
//       user: admin._id,
//       balance: amount,
//       transactions: [
//         {
//           user: new Types.ObjectId(senderId),
//           balance: amount,
//           type: 'Earn',
//           createdAt: new Date(),
//         },
//       ],
//     });
//   } else {
//     adminWallet.balance += amount;
//     adminWallet.transactions.push({
//       user: new Types.ObjectId(senderId),
//       balance: amount,
//       type: 'Earn',
//       createdAt: new Date(),
//     });
//     await adminWallet.save();
//   }

//   // Update or create provider wallet
//   let providerWallet = await Wallet.findOne({ user: ownerId });

//   if (!providerWallet) {
//     providerWallet = await Wallet.create({
//       user: new Types.ObjectId(ownerId),
//       balance: amount,
//       transactions: [
//         {
//           user: new Types.ObjectId(senderId),
//           balance: amount,
//           type: 'Earn',
//           createdAt: new Date(),
//         },
//       ],
//     });
//   } else {
//     providerWallet.balance += amount;
//     providerWallet.transactions.push({
//       user: new Types.ObjectId(senderId),
//       balance: amount,
//       type: 'Earn',
//       createdAt: new Date(),
//     });
//     await providerWallet.save();
//   }

//   return { adminWallet, providerWallet };
// };



const getAllFromDB = async (query: any) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build filters
  const filters: any = {};
  if (query.status) filters.status = query.status;
  if (query.userId) filters.user = query.userId;

  // Get total count for pagination
  const total = await Withdraw.countDocuments(filters);

  // Query with filters, populate, sorting, and pagination
  const result = await Withdraw.find(filters)
    .populate('user', '_id fullName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Mask cardId
  const maskedResult = result.map(item => {
    const cardId: any = item.cardId || '';
    const last4: any = cardId.slice(-4);
    const maskedCard: any = `xxxx xxxx xxxx ${last4}`;
    return {
      ...item.toObject(), // convert mongoose doc to plain object
      cardId: maskedCard,
    };
  });

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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

  return withdraw;
};

export const WithdrawService = {
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
