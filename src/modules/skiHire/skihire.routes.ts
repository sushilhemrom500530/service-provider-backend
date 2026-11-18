import { acceptListingDetailShape } from '../common/listing.helpers';
import { Router } from 'express';
import fileUploadHandler from './../../shared/fileUploadHandler';
import auth from './../../middlewares/auth';
import validateRequest, { parseJsonFields } from './../../shared/validateRequest';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { USER_UPLOADS_FOLDER } from './skihire.constant';
import { SkiHireController } from './skihire.controller';
import { SkiHireValidations } from './skihire.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

// multipart: thumbnail + item photos (itemPhoto_<i>, files / files[i], images / images[i])
const withUploads = [
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 20 },
    { name: 'images', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  parseJsonFields(['items', 'productItems', 'removeItemIds']),
];

const router = Router();

// ---- lists (before /:id) ----
router.get(['/', '/all'], SkiHireController.browse);
router.get(['/my', '/my-all'], auth('Provider', 'Admin'), SkiHireController.myListings);

// ---- create ----
router.post(
  ['/', '/create'],
  auth('Provider', 'Admin', 'User'), // role + providerType checked in the service (403)
  ...withUploads,
  acceptListingDetailShape,
  validateRequest(SkiHireValidations.createSkiHireSchema),
  SkiHireController.create,
);

// ---- old alias paths with the id last (before /:id) ----
router.patch(
  '/update/:id',
  auth('Provider', 'Admin'),
  ...withUploads,
  acceptListingDetailShape,
  validateRequest(SkiHireValidations.updateSkiHireSchema),
  SkiHireController.update,
);
router.delete('/delete/:id', auth('Provider', 'Admin'), SkiHireController.remove);
router.post('/review/:id', auth('User'), SkiHireController.review);

// ---- single listing ----
router.get('/:id', SkiHireController.getDetail);
router.get('/:id/reviews', SkiHireController.getReviews);
router.patch(
  '/:id/status',
  auth('Provider', 'Admin'),
  validateRequest(SkiHireValidations.statusSchema),
  SkiHireController.setStatus,
);
router.patch(
  '/:id',
  auth('Provider', 'Admin'),
  ...withUploads,
  acceptListingDetailShape,
  validateRequest(SkiHireValidations.updateSkiHireSchema),
  SkiHireController.update,
);
router.delete('/:id', auth('Provider', 'Admin'), SkiHireController.remove);
router.post('/:id/review', auth('User'), SkiHireController.review);

export const SkiHireRoutes = router;
