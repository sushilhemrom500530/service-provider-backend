import { Router, NextFunction, Response, Request } from 'express';
import auth from '../../middlewares/auth';
import { UserController } from './user.controller';
import fileUploadHandler from '../../shared/fileUploadHandler';
import { USER_UPLOADS_FOLDER } from './user.constant';
import convertHeicToPngMiddleware from '../../shared/convertHeicToPngMiddleware';
const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();
 
// //get user activity graph chart
// router.get(
//   '/activity-graph-chart',
//   auth('Admin', 'Super_Admin'),
//   UserController.userActivityGraphChart
// );
 
// router.get(
//   '/dashboard/overview',
//   auth('Admin', 'Super_Admin'),
//   UserController.getDashboardOverview
// );
 
router.get('/all', UserController.getAllUsers);
 
// router.get('/:id', auth('Admin', 'Super_Admin'), UserController.getUserById);
 
// router.patch(
//   '/:id/status',
//   auth('Admin', 'Super_Admin'),
//   UserController.updateUserStatus
// );
 
// router.get('/profile/me', auth('Common'), UserController.getMyProfile);
 
router.patch(
  '/update-profile',
  auth('User', 'Admin', 'Provider'), 
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),

  (req: Request, res: Response, next: NextFunction) => {
    try { 
      // ✅ Parse the JSON data field safely
      const parsedData = req.body?.data ? JSON.parse(req.body.data) : {};
      req.body = { ...parsedData };

      return UserController.updateMyProfile(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

 
// router.patch(
//   '/update-profile',
//   auth('User', 'Admin', 'Provider'),
//   convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
//   uploads.single('file'),
//    (req: Request, res: Response, next: NextFunction) => {
//     req.body = JSON.parse(req.body.data);
//     return UserController.updateMyProfile(req, res, next);
//   }
// );


 //   convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
//   UserController.updateMyProfile



// router.delete(
//   '/profile/delete',
//   auth('Common'),
//   UserController.deleteMyProfile
// );



export const UserRoutes = router;
