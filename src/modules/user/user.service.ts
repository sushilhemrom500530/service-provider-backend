import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { IUser, UserStatus, IUpdateData } from './user.interface';
import { User } from './user.model';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import { JwtPayload } from 'jsonwebtoken';

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getAllUsers = async (
  filters: Record<string, any>,
  options: IPaginationOptions
): Promise<IPaginationResult<IUser>> => {
  const query: Record<string, any> = {};
 
  if (filters.role) {
    query.role = filters.role;
  } else { 
    query.role = { $nin: ['Admin'] };
  }
 
  if (filters.status) {
    query.status = filters.status;
  } else { 
    query.status = 'Active';
  }
 
  if (filters.searchTerm && typeof filters.searchTerm === 'string') {
    query.$or = [
      { email: { $regex: filters.searchTerm, $options: 'i' } },
      { fullName: { $regex: filters.searchTerm, $options: 'i' } },
    ];
  }

  options.sortBy = options.sortBy || 'createdAt';
  options.select = '-password -__v';

  const result = await User.paginate(query, options);
  return result;
};

const getUserById = async (userId: string): Promise<IUser | null> => {
  const user = await User.findOne({
    _id: userId,
    status: UserStatus.Active,
  }).select(
    '-password -__v -security -preferences -socialAccounts -profile._id  -isResetPassword -metadata.ipAddresses -metadata.userAgent -metadata._id'
  );
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  return user;
};

const getDashboardOverview = async () => {
  const totalUsers = await User.countDocuments({
    role: 'User',
    status: UserStatus.Active,
  });
  const totalAdmins = await User.countDocuments({
    role: { $in: ['Admin', 'Super_Admin'] },
    status: UserStatus.Active,
  });
  const totalBannedUsers = await User.countDocuments({
    role: 'User',
    status: UserStatus.Banned,
  });
  const totalInactiveUsers = await User.countDocuments({
    role: 'User',
    status: UserStatus.Inactive,
  });
  return {
    totalUsers,
    totalAdmins,
    totalBannedUsers,
    totalInactiveUsers,
  };
};

const userActivityGraphChart = async (
  period: 'weekly' | 'monthly' | 'yearly'
) => {
  let userActivityData: { name: string; users: number }[] = [];
  let startDate: Date;
  let endDate: Date = new Date();

  // Get the current year
  const currentYear = new Date().getFullYear();

  // Determine the time range based on the period
  if (period === 'weekly') {
    // Last 7 days (days of the week)
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    userActivityData = dayNames.map(day => ({ name: day, users: 0 }));
  } else if (period === 'monthly') {
    // Last 30 days, grouped by week
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    userActivityData = [
      { name: 'Week 1', users: 0 },
      { name: 'Week 2', users: 0 },
      { name: 'Week 3', users: 0 },
      { name: 'Week 4', users: 0 },
      { name: 'Week 5', users: 0 },
    ];
  } else if (period === 'yearly') {
    // Current year, grouped by month
    startDate = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    endDate = new Date(`${currentYear}-12-31T23:59:59.999Z`);
    userActivityData = monthNames.map(month => ({ name: month, users: 0 }));
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid period. Use "weekly", "monthly", or "yearly".'
    );
  }

  // Fetch User Activity (using correct field path)
  const userActivity = await User.aggregate([
    {
      $match: {
        'metadata.createdAt': { $gte: startDate, $lte: endDate },
        role: 'User',
        status: UserStatus.Active,
      },
    },
    {
      $group: {
        _id:
          period === 'weekly'
            ? { $dayOfWeek: '$metadata.createdAt' }
            : period === 'monthly'
            ? {
                $floor: {
                  $divide: [
                    {
                      $divide: [
                        { $subtract: ['$metadata.createdAt', startDate] },
                        1000 * 60 * 60 * 24, // Convert to days
                      ],
                    },
                    7, // Group by weeks
                  ],
                },
              }
            : { $month: '$metadata.createdAt' },
        activity: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  //  Populate User Activity Data based on period
  userActivity.forEach((entry: any) => {
    if (period === 'weekly') {
      // MongoDB $dayOfWeek: 1 = Sunday, 2 = Monday, ..., 7 = Saturday
      const dayIndex = entry._id === 1 ? 0 : entry._id - 1; // Adjust for array index
      if (userActivityData[dayIndex]) {
        userActivityData[dayIndex].users = entry.activity;
      }
    } else if (period === 'monthly') {
      // Week index (0-4)
      const weekIndex = Math.min(entry._id, 4); // Cap at week 5
      if (userActivityData[weekIndex]) {
        userActivityData[weekIndex].users += entry.activity;
      }
    } else if (period === 'yearly') {
      // Month index (1-12, adjust for array 0-11)
      const monthIndex = entry._id - 1;
      if (userActivityData[monthIndex]) {
        userActivityData[monthIndex].users = entry.activity;
      }
    }
  });

  return { userActivity: userActivityData, period };
};

const updateUserStatus = async (
  userId: string,
  user: JwtPayload,
  status: UserStatus
): Promise<IUser | null> => {
  const existsUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!existsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'Only Admin can delete user.');

  const result = await User.findByIdAndUpdate(
    userId,
    { status },
    { new: true, runValidators: true }
  );
  return result;
};

//  Get My Profile
const getMyProfile = async (userId: string): Promise<IUser | null> => {
  const user = await User.findOne({
    _id: userId,
    status: UserStatus.Active,
  }).select(
    '-password -__v -security -preferences -socialAccounts -profile._id  -isResetPassword -metadata.ipAddresses -metadata.userAgent -metadata._id'
  );
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  return user;
};

//  Update My Profile
const updateMyProfile = async (
  userId: string,
  updateData: IUpdateData
): Promise<IUser | null> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );

  return result;
};

//  Delete My Profile
const deleteMyProfile = async (userId: string): Promise<IUser | null> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  const result = await User.findByIdAndDelete(userId);
  return result;
};

export const UserService = {
  getAllUsers,
  getUserById,
  updateUserStatus,
  getMyProfile,
  updateMyProfile,
  getDashboardOverview,
  userActivityGraphChart,
  deleteMyProfile,
};
