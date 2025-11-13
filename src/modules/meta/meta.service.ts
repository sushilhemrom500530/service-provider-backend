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
import { startOfYear, endOfYear } from 'date-fns';
import mongoose from 'mongoose';



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
    (a, b) =>
      new Date(b?.createdAt).getTime() - new Date(a?.createdAt).getTime()
  );

  const recentServices = allProducts.slice(0, 4);

  return {
    stats: {
      todayBookingCount,
      totalBooking,
      totalBalance: totalBalance?.balance || 0,
    },
    recentBookings,
    recentServices,
  };
};

// admin dashboard data
const getAdminDashboard = async (user: JwtPayload) => {
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin not found.');
  }

  const totalBalance = await Wallet.findOne({ user: isExistUser._id }).select('balance');
  const totalUser = await User.countDocuments();
  const totalProvider = await User.countDocuments({ role: 'Provider' });

  const yearStart = startOfYear(new Date());
  const yearEnd = endOfYear(new Date());

  // Define all models and their income field names
  const modelsWithFields = [
    { model: SkiHire, field: 'price', name: 'Ski Hire' },
    { model: SkiPass, field: 'price', name: 'Ski Pass' },
    { model: Transport, field: 'amount', name: 'Transport' },
    { model: Restaurant, field: 'amount', name: 'Restaurant' },
    { model: Massage, field: 'price', name: 'Massage' },
  ];

  // Monthly earnings (merge all)
  const monthlyTotals = Array(12).fill(0);

  for (const { model, field } of modelsWithFields) {
    const result = await model.aggregate([
      {
        $match: {
          createdAt: { $gte: yearStart, $lte: yearEnd },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          total: { $sum: `$${field}` },
        },
      },
    ]);

    result.forEach((r) => {
      monthlyTotals[r._id - 1] += r.total;
    });
  }

  const earningsChart = [
    { month: 'Jan', earnings: monthlyTotals[0] },
    { month: 'Feb', earnings: monthlyTotals[1] },
    { month: 'Mar', earnings: monthlyTotals[2] },
    { month: 'Apr', earnings: monthlyTotals[3] },
    { month: 'May', earnings: monthlyTotals[4] },
    { month: 'Jun', earnings: monthlyTotals[5] },
    { month: 'Jul', earnings: monthlyTotals[6] },
    { month: 'Aug', earnings: monthlyTotals[7] },
    { month: 'Sep', earnings: monthlyTotals[8] },
    { month: 'Oct', earnings: monthlyTotals[9] },
    { month: 'Nov', earnings: monthlyTotals[10] },
    { month: 'Dec', earnings: monthlyTotals[11] },
  ];

  // Pie chart — booking by service
  const bookingByServices = await Promise.all(
    modelsWithFields.map(async ({ model, name }) => ({
      name,
      value: await model.countDocuments(),
    }))
  );

  return {
    stats: {
      totalIncome: totalBalance?.balance || 0,
      totalUser,
      totalProvider,
    },
    charts: {
      earnings: earningsChart,
      bookingByServices,
    },
  };
};


export const MetaService = {
  getProviderDashboard,
  getAdminDashboard,
};
