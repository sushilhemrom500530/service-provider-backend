import { acceptListingDetailShape } from '../common/listing.helpers';
import { Router } from 'express';
import fileUploadHandler from './../../shared/fileUploadHandler';
import { USER_UPLOADS_FOLDER } from './restaurant.constant';
import auth from './../../middlewares/auth';
import { RestaurantController } from './restaurant.controller';
import validateRequest, { parseJsonFields } from './../../shared/validateRequest';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { RestaurantValidations } from './restaurant.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

// thumbnail + seat photos (files / files[0] / files[1] / seatPhoto_<i>); multer skips JSON bodies
const listingUpload = [
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  parseJsonFields(['seats', 'items', 'slots', 'removeSeatIds', 'removeItemIds', 'removeSlotIds']),
];

const router = Router();

/* ---------- collection routes (before /:id) ---------- */

router.get(['/', '/all'], RestaurantController.browse);

router.get(['/my', '/my-all'], auth('Provider', 'Admin'), RestaurantController.mine);

router.get(
  ['/service-fee', '/view/service-fee'],
  auth('User', 'Provider', 'Admin'),
  RestaurantController.getServiceFee,
);

router.patch(
  ['/service-fee', '/service-fee/update'],
  auth('Admin'),
  validateRequest(RestaurantValidations.updateServiceFee),
  RestaurantController.updateServiceFee,
);

router.post(
  ['/', '/create'],
  auth('Provider', 'Admin'),
  ...listingUpload,
  acceptListingDetailShape,
  validateRequest(RestaurantValidations.createRestaurant),
  RestaurantController.create,
);

/* ---------- item routes ---------- */

router.get('/:id/reviews', RestaurantController.reviews);

router.post(['/:id/review', '/review/:id'], auth('User'), RestaurantController.review);

router.patch(
  '/:id/status',
  auth('Provider', 'Admin'),
  validateRequest(RestaurantValidations.updateStatus),
  RestaurantController.setStatus,
);

router.patch(
  ['/:id', '/update/:id'],
  auth('Provider', 'Admin'),
  ...listingUpload,
  acceptListingDetailShape,
  validateRequest(RestaurantValidations.updateRestaurant),
  RestaurantController.update,
);

router.delete(['/:id', '/delete/:id'], auth('Provider', 'Admin'), RestaurantController.remove);

router.get('/:id', RestaurantController.detail);

export const RestaurantRoutes = router;
