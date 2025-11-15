import { StatusCodes } from 'http-status-codes';
import { NotificationService } from './notification.services';
import catchAsync from '../../shared/catchAsync';
import pick from '../../shared/pick';
import sendResponse from '../../shared/sendResponse';
import { notificationFilters } from './notification.constants';
import AppError from '../../errors/AppErro';
import { CustomJwtPayload } from '../../types';

const getALLNotification = catchAsync(async (req, res) => { 
  const userId = (req.user as CustomJwtPayload)?.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
  }
  const result = await NotificationService.getAllUserNotification( 
    userId
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    data: result,
    message: 'Notifications fetched successfully',
  });
}); 
export const NotificationController = {
  getALLNotification, 
};
