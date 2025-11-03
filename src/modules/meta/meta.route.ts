import { Router } from 'express';
import auth from '../../middlewares/auth';
import { MetaController } from './meta.controller';
 
const router = Router();

router.get('/provider', 
    auth('Admin', 'Provider'),
    MetaController.getProviderDashboardData
);

export const MetaRoutes = router;
