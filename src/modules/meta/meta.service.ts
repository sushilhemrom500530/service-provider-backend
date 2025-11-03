import { JwtPayload } from 'jsonwebtoken';
import AppError from './../../errors/AppErro';
import { User } from './../user/user.model';
import { Wallet } from './../wallet/wallet.model';
import { Booking } from './../booking/booking.model';

//  for provider home page data
const getProviderDashboard = async (user: JwtPayload) => {
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Provider',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  
  const totalBalance = await Wallet.findOne({
    user: isExistUser?._id,
  }).select('balance');


  const providerBookings = await Booking.find()
    .populate({
      path: 'product',
      select: 'owner serviceName',
    })
    .populate('user', 'fullName email phoneNumber')
    .sort({ createdAt: -1 });

  const providerOnlyBookings = providerBookings.filter(
    (booking: any) =>
      booking?.product?.owner?.toString() === isExistUser._id.toString()
  );

  const totalBooking = providerOnlyBookings.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayBookingCount = providerOnlyBookings.filter((booking: any) => {
    const created = new Date(booking.createdAt);
    return created >= today;
  }).length;

  const recentBookings = providerOnlyBookings.slice(0, 4);

  return {
    totalBooking,
    todayBookingCount,
    recentBookings,
    totalBalance: totalBalance?.balance || 0,
  };
};

export const MetaService = {
  getProviderDashboard,
};
