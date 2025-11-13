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


router.get('/common-service', 
    auth('Admin'),
    MetaController.getAdminServiceManagement
);

router.get('/restaurant-service', 
    auth('Admin'),
    MetaController.getAdminRestaurantService
);

export const MetaRoutes = router;
