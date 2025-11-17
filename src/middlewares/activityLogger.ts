import { Request, Response, NextFunction } from 'express';
// import { ActivityLogService } from '../modules/activityLog/activityLog.services';
// import { IActivityLogStatus } from '../modules/activityLog/activityLog.interface';
import { CustomJwtPayload } from '../types';

// Activity logging middleware
const activityLogger = async (req: Request, res: Response, next: NextFunction) => {
  // Capture the start time for response time calculation
  const startTime = Date.now();
  
  // // Function to log the activity
  // const logActivity = async (status: IActivityLogStatus, details?: any) => {
  //   try {
  //     const ip = req.ip || req.connection.remoteAddress || 'unknown';
  //     const userAgent = req.get('User-Agent') || 'unknown';
      
  //     await ActivityLogService.logActivity({
  //       userId: req.user?.userId,
  //       action: `${req.method} ${req.path}`,
  //       resource: req.path.split('/')[1] || 'unknown', // First part of path as resource
  //       method: req.method,
  //       endpoint: req.path,
  //       ip,
  //       userAgent,
  //       status,
  //       details: {
  //         ...details,
  //         responseTime: Date.now() - startTime,
  //         statusCode: res.statusCode,
  //       },
  //     });
  //   } catch (error) {
  //     // Don't let logging errors break the request
  //     console.error('Activity logging error:', error);
  //   }
  // };
  
  // // Listen for the response finish event to log successful requests
  // res.on('finish', async () => {
  //   if (res.statusCode >= 200 && res.statusCode < 400) {
  //     await logActivity(IActivityLogStatus.SUCCESS);
  //   } else if (res.statusCode >= 400 && res.statusCode < 500) {
  //     await logActivity(IActivityLogStatus.FAILURE, {
  //       message: 'Client error',
  //     });
  //   } else if (res.statusCode >= 500) {
  //     await logActivity(IActivityLogStatus.FAILURE, {
  //       message: 'Server error',
  //     });
  //   }
  // });
  
  // Listen for errors
  // res.on('error', async (err) => {
  //   await logActivity(IActivityLogStatus.FAILURE, {
  //     message: err.message,
  //     stack: err.stack,
  //   });
  // });
  
  next();
};

export default activityLogger;