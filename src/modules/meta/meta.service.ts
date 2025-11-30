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
import mongoose from 'mongoose';
import { IQuery } from './meta.inteface';
import { StatusCodes } from 'http-status-codes';
import { startOfYear, endOfYear, setYear } from 'date-fns';
import dayjs from 'dayjs';

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
      select: '-items -__v ',
    })
    .populate('user', 'fullName email phoneNumber image')
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

  const recentBookings = providerOnlyBookings.slice(0, 4).map((b: any) => {
    const bookingObj = b.toObject ? b.toObject() : b;

    // Duration in hours and minutes
    const start = dayjs(b.startDateAndTime);
    const end = dayjs(b.endDateAndTime);
    const diffMinutes = end.diff(start, 'minute'); // total minutes
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    // bookingObj.duration = `${hours}h ${minutes}m`;
    if (
      bookingObj?.category === 'Ski_Hire' ||
      bookingObj?.category === 'Transport'
    ) {
      bookingObj.duration = `${hours}h ${minutes}m`;
    }

    // Safely map bookingItems
    if (b.bookingItems) {
      bookingObj.bookingItems = b.bookingItems.map((bi: any) => ({
        ...(bi.toObject?.() || bi),
      }));
    }

    return bookingObj;
  });

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

    const formatted = products?.map((p: any) => ({
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
const getAdminDashboard = async (user: JwtPayload, query: any) => {
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin not found.');
  }

  const totalBalance = await Wallet.findOne({ user: isExistUser._id }).select(
    'balance'
  );
  const totalUser = await User.countDocuments();
  const totalProvider = await User.countDocuments({ role: 'Provider' });

  // Get year from query (default: current year)
  const selectedYear = query?.year
    ? parseInt(query?.year, 10)
    : new Date().getFullYear();

  // Use date-fns to set start and end of selected year
  const yearStart = startOfYear(setYear(new Date(), selectedYear));
  const yearEnd = endOfYear(setYear(new Date(), selectedYear));

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

    result.forEach(r => {
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

const getCommonService = async (user: JwtPayload, query: IQuery) => {
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin not found.');
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filters: any = { category: { $ne: 'Restaurant' } };

  if (query.bookingStatus) {
    filters.bookingStatus = { $regex: query.bookingStatus, $options: 'i' };
  }

  // Optional search by user name/email or product title
  if (query.search) {
    const [users, skiPasses] = await Promise.all([
      User.find(
        {
          $or: [
            { name: { $regex: query.search, $options: 'i' } },
            { email: { $regex: query.search, $options: 'i' } },
          ],
        },
        '_id'
      ),
      Booking.db
        .model('SkiPass')
        .find({ title: { $regex: query.search, $options: 'i' } }, '_id'),
    ]);

    filters.$or = [
      { user: { $in: users.map(u => u._id) } },
      { product: { $in: skiPasses.map(p => p._id) } },
    ];
  }

  const total = await Booking.countDocuments(filters);

  // Query bookings with populate and pagination
  const bookings = await Booking.find(filters)
    .populate({
      path: 'user',
      select: 'fullName email phoneNumber role status',
    })
    .populate({
      path: 'product',
      select: 'title category owner totalPrice items thumbnail serviceArea',
      populate: {
        path: 'owner',
        select: 'fullName email phoneNumber role providerType',
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    bookings,
  };
};

const getSingleService = async (user: JwtPayload, serviceId: string) => {
  // Check if admin exists
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin not found.');
  }

  // Fetch the booking with user and product/owner populated
  const booking = await Booking.findById(serviceId)
    .populate({
      path: 'user',
      select: '-password',
    })
    .populate({
      path: 'product',
      populate: {
        path: 'owner',
        select: '-password',
      },
    })
    .lean();

  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  return booking;
};

const getRestaurantManagement = async (user: JwtPayload, query: IQuery) => {
  const isExistUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin not found.');
  }

  // Pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filters: any = { category: 'Restaurant', bookingStatus: 'Pending' };

  // Optional filters
  if (query.bookingStatus)
    filters.bookingStatus = { $regex: query.bookingStatus, $options: 'i' };
  if (query.userId) filters.userId = { $regex: query.userId, $options: 'i' };

  if (query.search) {
    const matchedUsers = await User.find(
      {
        $or: [
          { name: { $regex: query.search, $options: 'i' } },
          { email: { $regex: query.search, $options: 'i' } },
        ],
      },
      '_id'
    );

    filters.user = { $in: matchedUsers.map(u => u._id) };
  }

  const total = await Booking.countDocuments(filters);

  // Fetch bookings with populate and pagination
  const bookings = await Booking.find(filters)
    .populate({
      path: 'user',
      select: 'name email phoneNumber role status',
    })
    .populate({
      path: 'product',
      select:
        'title owner totalPrice items thumbnail serviceArea availableSlots serviceFee',
      populate: {
        path: 'owner',
        select: 'name email phoneNumber role providerType',
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    bookings,
  };
};
export const MetaService = {
  getProviderDashboard,
  getAdminDashboard,
  getCommonService,
  getRestaurantManagement,
  getSingleService,
};
