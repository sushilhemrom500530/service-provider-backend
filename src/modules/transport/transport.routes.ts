import { acceptListingDetailShape } from '../common/listing.helpers';
import { NextFunction, Request, Response, Router } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import validateRequest from './../../shared/validateRequest';
import { USER_UPLOADS_FOLDER } from './transport.constant';
import { TransportController } from './transport.controller';
import { TransportValidations } from './transport.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);
const router = Router();

/**
 * Thumbnail upload: accepts any file field (multer any()), then exposes the
 * "file" (or "thumbnail") field as req.file so HEIC conversion applies.
 */
const thumbnailUpload = [
  uploads.fields([{ name: 'file', maxCount: 1 }]),
  (req: Request, _res: Response, next: NextFunction) => {
    const files: any = req.files;
    if (!req.file && files && !Array.isArray(files))
      (req as any).file = files.file?.[0] || files.thumbnail?.[0];
    next();
  },
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
];

const ANY_ROLE = ['User', 'Provider', 'Admin'];
const MANAGERS = ['Provider', 'Admin'];

// ---- browse (public) ----
router.get(['/', '/all'], TransportController.browse);

// ---- own listings (before /:id) ----
router.get(['/my', '/my-all'], auth(...MANAGERS), TransportController.myListings);

// ---- create (Transport providers; checked in the service) ----
router.post(
  ['/', '/create'],
  auth(...ANY_ROLE),
  ...thumbnailUpload,
  acceptListingDetailShape,
  validateRequest(TransportValidations.createTransport),
  TransportController.create,
);

// ---- legacy aliases with the id at the end ----
router.patch(
  '/update/:id',
  auth(...MANAGERS),
  ...thumbnailUpload,
  acceptListingDetailShape,
  validateRequest(TransportValidations.updateTransport),
  TransportController.update,
);
router.delete('/delete/:id', auth(...MANAGERS), TransportController.remove);
router.post('/review/:id', auth('User'), TransportController.review);

// ---- by id ----
router.get('/:id', TransportController.getById);
router.get('/:id/reviews', TransportController.getReviews);
router.post('/:id/review', auth('User'), TransportController.review);
router.patch(
  '/:id/status',
  auth(...MANAGERS),
  validateRequest(TransportValidations.updateStatus),
  TransportController.setStatus,
);
router.patch(
  '/:id',
  auth(...MANAGERS),
  ...thumbnailUpload,
  acceptListingDetailShape,
  validateRequest(TransportValidations.updateTransport),
  TransportController.update,
);
router.delete('/:id', auth(...MANAGERS), TransportController.remove);

export const TransportRoutes = router;
