import { NextFunction, Request, Response, Router } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import validateRequest, { parseJsonFields } from './../../shared/validateRequest';
import { MASSAGE_JSON_FIELDS, USER_UPLOADS_FOLDER } from './massage.constant';
import { MassageController } from './massage.controller';
import { MassageValidations } from './massage.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

/** Multipart with an optional thumbnail in field "file" (or "thumbnail") */
const thumbnailUpload = [
  uploads.fields([{ name: 'file' }, { name: 'thumbnail' }]),
  (req: Request, _res: Response, next: NextFunction) => {
    const files: any = req.files;
    const file = files?.file?.[0] || files?.thumbnail?.[0];
    if (file) req.file = file;
    next();
  },
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  parseJsonFields(MASSAGE_JSON_FIELDS),
];

const owners = auth('Provider', 'Admin');

const router = Router();

/* ---------- browse (public) ---------- */
router.get('/', MassageController.browse);
router.get('/all', MassageController.browse);

/* ---------- provider's own listings ---------- */
router.get('/my', owners, MassageController.myListings);
router.get('/my-all', owners, MassageController.myListings);

/* ---------- create ---------- */
const create = [
  auth('Provider'),
  ...thumbnailUpload,
  validateRequest(MassageValidations.createMassage),
  MassageController.create,
];
router.post('/', ...create);
router.post('/create', ...create);

/* ---------- update / status / delete (owner or Admin) ---------- */
const update = [
  owners,
  ...thumbnailUpload,
  validateRequest(MassageValidations.updateMassage),
  MassageController.update,
];
router.patch('/update/:id', ...update);
router.delete('/delete/:id', owners, MassageController.remove);

/* ---------- review (customer) ---------- */
router.post('/review/:id', auth('User'), MassageController.review);

/* ---------- /:id routes (keep after the fixed paths) ---------- */
router.get('/:id', MassageController.getDetail);
router.get('/:id/reviews', MassageController.getReviews);
router.patch(
  '/:id/status',
  owners,
  validateRequest(MassageValidations.statusMassage),
  MassageController.setStatus,
);
router.patch('/:id', ...update);
router.delete('/:id', owners, MassageController.remove);
router.post('/:id/review', auth('User'), MassageController.review);

export const MassageRoutes = router;
