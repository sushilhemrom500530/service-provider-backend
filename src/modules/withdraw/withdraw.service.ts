import { Types } from 'mongoose';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { config } from './../../config/index';
import { Withdraw } from './Withdraw.model';
import { IWithdrawRequest } from './withdraw.inteface';
import { Wallet } from './../wallet/wallet.model';
import { generateTransactionId } from './../../utils/generateTransactionId';
import { v4 as uuidv4 } from 'uuid';
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

const getAllFromDB = async user => {
  const isExistsAdmin = await User.findOne({ role: user?.role });
  if (!isExistsAdmin) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }
  const result = await Withdraw.find()
    .populate('user', '_id fullName email')
    .lean();

  // Mask cardId
  const maskedResult = result?.map(item => {
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
  if (wallet.balance < payload.amount)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient wallet balance');

  //  calculate profit amount
  const profitRate = (wallet.profitCharge || 0) / 100;
  const mainAmount =
    Number(payload.amount) - Number(payload.amount) * profitRate;
 
 
  const withdrawData: Partial<IWithdrawRequest> = {
    user: isExistsUser._id,
    wallet: wallet._id,
    cardId: payload.cardId,
    amount: mainAmount,
    transactionId: generateTransactionId('WD'),
    profitCharge: wallet.profitCharge || 0,  
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
    type: 'Withdraw',
    createdAt: new Date(),
  });
  await adminWallet.save();

  // Update provider wallet
  providerWallet.balance -= withdrawalRequestBalance;
  providerWallet.transactions.push({
    user: new Types.ObjectId(isExistsAdmin?._id),
    balance: -withdrawalRequestBalance,
    type: 'Withdraw',
    createdAt: new Date(),
  });
  await providerWallet.save();

  // Update withdraw request
  withdraw.status = 'Paid';
  await withdraw.save();

  return withdraw;
};

export const WithdrawService = {
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
