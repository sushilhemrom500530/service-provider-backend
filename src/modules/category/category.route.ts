import { Router, NextFunction, Response, Request } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from '../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from '../../shared/convertHeicToPngMiddleware';
import validateRequest from './../../shared/validateRequest';
import { CategoryController } from './category.controller';
import { USER_UPLOADS_FOLDER } from './category.constant';
import { CategoryValidation } from './category.validation';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

router.get('/all', CategoryController.getAllCategories);

router.get(
  '/:id',
  auth('Admin'),
  CategoryController.getCategoryById
);

router.post(
  '/create',
  auth('Admin'),
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 50 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(CategoryValidation.createCategory),
  CategoryController.createCategory
);


router.post(
  '/add-sub-category/:id',
  auth('Admin'),
  uploads.fields([  
    { name: 'files', maxCount: 50 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  // validateRequest(CategoryValidation.createSubCategory),
  CategoryController.addSubCategory
);

router.patch(
  '/update/:id',
  auth('Admin'),
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 50 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(CategoryValidation.updateCategory),
  CategoryController.updateCategory
);

router.delete(
  '/delete/:id',
  auth('Admin'),
  CategoryController.deleteCategory
);

export const CategoryRoutes = router;
