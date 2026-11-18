import { Router } from 'express';
import authRoutes from './auth.routes';
import workshopRoutes from './workshop.routes';
import { health } from '../controllers/health.controller';

/**
 * Central router mounted at /api.
 * Member 2: mount your routers here too, e.g. router.use('/quotes', quoteRoutes).
 */
const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/workshops', workshopRoutes);

export default router;
