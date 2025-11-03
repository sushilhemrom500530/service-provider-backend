import { JwtPayload } from 'jsonwebtoken';
import AppError from './../../errors/AppErro';
import { User } from './../user/user.model';
import { Wallet } from './../wallet/wallet.model';
import { Booking } from './../booking/booking.model';
import { SkiPass } from './../skiPass/skipass.model';
import { SkiHire } from './../skiHire/skihire.model';
import { Transport } from './../transport/transport.model';
import { Restaurant } from './../restaurant/restaurant.model';
import { Massage } from './../massage/massage.model';

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

  // Services of this provider
  const models: Record<string, any> = {
    SkiPass,
    SkiHire,
    Transport,
    Restaurant,
    Massage,
  };

  let allProducts: any[] = [];

  for (const [modelName, Model] of Object.entries(models)) {
    const products = await Model.find({ owner: isExistUser?._id })
      .select('-items') 
      .sort({ createdAt: -1 })
      .lean();

    const formatted = products?.map(p => ({
      ...p,
      model: modelName,  
    }));

    allProducts.push(...formatted);
  }

  // Sort all products by createdAt (newest first)
  allProducts.sort(
    (a, b) => new Date(b?.createdAt).getTime() - new Date(a?.createdAt).getTime()
  );

  const recentServices = allProducts.slice(0, 4);

  return {
    totalBooking,
    todayBookingCount,
    recentBookings,
    totalBalance: totalBalance?.balance || 0,
    recentServices
  };
};

export const MetaService = {
  getProviderDashboard,
};
