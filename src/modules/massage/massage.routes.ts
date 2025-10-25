import { Router } from 'express';
import auth from '../../middlewares/auth'; 
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { USER_UPLOADS_FOLDER } from './massage.constant';

 const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  MassageController.getAllMassageFromDB
);

// get single 
router.get(
  '/:id',
  auth('User','Admin', 'Provider'),
  MassageController.getSingleSkipPassFromDB
);


// create 
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
   validateRequest(MassageValidations.createMassageSchema),
  MassageController.addMassageIntoDB
);


// review 
router.post(
  '/review/:id',
  auth('User',),  
   validateRequest(MassageValidations.reviewMassageSchema),
  MassageController.reviewMassage
);
 

// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'), 
  validateRequest(MassageValidations.createMassageSchema),
  MassageController.updateMassageIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Provider'),
  MassageController.deleteMassageIntoDB
);
 
export const MassageRoutes = router;