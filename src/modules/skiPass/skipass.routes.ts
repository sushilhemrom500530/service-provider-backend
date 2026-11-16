import { NextFunction, Request, Response, Router } from 'express';
import auth from '../../middlewares/auth';
import { SkiPassController } from './skipass.controller';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import validateRequest, { parseJsonFields } from './../../shared/validateRequest';
import { SkipassValidations } from './skipass.validations';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

/**
 * Multipart: accepts any field names (upload.any) and uses the first file sent
 * as `file` (what the app sends today) or `thumbnail` as req.file.
 */
const thumbnailUpload = [
  uploads.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  (req: Request, _res: Response, next: NextFunction) => {
    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.file?.[0] || files?.thumbnail?.[0];
    if (file) req.file = file;
    next();
  },
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  parseJsonFields(['services']),
];

const OWNER_OR_ADMIN = ['Provider', 'Admin'];

const router = Router();

/* ---------- lists (before /:id) ---------- */
router.get('/', SkiPassController.browse);
router.get('/all', SkiPassController.browse);
router.get('/my', auth(...OWNER_OR_ADMIN), SkiPassController.getMine);
router.get('/my-all', auth(...OWNER_OR_ADMIN), SkiPassController.getMine);

/* ---------- create ---------- */
const create = [
  auth(...OWNER_OR_ADMIN),
  ...thumbnailUpload,
  validateRequest(SkipassValidations.createSkiPassSchema),
  SkiPassController.create,
];
router.post('/', ...create);
router.post('/create', ...create);

/* ---------- update / status / delete (owner or Admin) ---------- */
const update = [
  auth(...OWNER_OR_ADMIN),
  ...thumbnailUpload,
  validateRequest(SkipassValidations.updateSkiPassSchema),
  SkiPassController.update,
];
router.patch('/update/:id', ...update);
router.patch(
  '/:id/status',
  auth(...OWNER_OR_ADMIN),
  validateRequest(SkipassValidations.statusSchema),
  SkiPassController.setStatus,
);
router.patch('/:id', ...update);

router.delete('/delete/:id', auth(...OWNER_OR_ADMIN), SkiPassController.remove);
router.delete('/:id', auth(...OWNER_OR_ADMIN), SkiPassController.remove);

/* ---------- reviews ---------- */
router.post('/review/:id', auth('User'), SkiPassController.review);
router.post('/:id/review', auth('User'), SkiPassController.review);
router.get('/:id/reviews', SkiPassController.getReviews);

/* ---------- detail (last) ---------- */
router.get('/:id', SkiPassController.getOne);

export const SkiPassRoutes = router;
