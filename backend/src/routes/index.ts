import { Router } from 'express';
import authRoutes from './auth.routes';
import { health } from '../controllers/health.controller';
import quoteRoutes from './quote.routes';

/**
 * Central router mounted at /api.
 * Member 2: mount your routers here too, e.g. router.use('/quotes', quoteRoutes).
 */
const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/quotes', quoteRoutes);

export default router;
