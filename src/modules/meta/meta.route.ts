import { Router } from 'express';
import auth from '../../middlewares/auth';
import { MetaController } from './meta.controller';
 
const router = Router();

router.get('/provider', 
    auth('Admin', 'Provider'),
    MetaController.getProviderDashboardData
);


router.get('/admin', 
    auth('Admin'),
    MetaController.getAdminDashboardData
);

export const MetaRoutes = router;
