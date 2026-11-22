import { Router } from 'express';
import authRoutes from './auth.routes';
import workshopRoutes from './workshop.routes';
import jobRoutes from './job.routes';
import invitationRoutes from './invitation.routes';
import { health } from '../controllers/health.controller';
import quoteRoutes from './quote.routes';
import orderRoutes from './order.routes';

/**
 * Central router mounted at /api.
 * Member 2: mount your routers here too, e.g. router.use('/quotes', quoteRoutes).
 */
const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/workshops', workshopRoutes);
router.use('/jobs', jobRoutes);
router.use('/invitations', invitationRoutes);
router.use('/quotes', quoteRoutes);
router.use('/orders', orderRoutes);

export default router;
