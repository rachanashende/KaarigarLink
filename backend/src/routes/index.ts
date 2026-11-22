import { Router } from 'express';
import authRoutes from './auth.routes';
import workshopRoutes from './workshop.routes';
import jobRoutes from './job.routes';
import invitationRoutes from './invitation.routes';
import { health } from '../controllers/health.controller';
import quoteRoutes from './quote.routes';
import orderRoutes from './order.routes';
import milestoneRoutes from './milestone.routes';
import paymentRoutes from './payment.routes';
import inspectionRoutes from './inspection.routes';
import adminRoutes from './admin.routes';
import activityRoutes from './activity.routes';

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
router.use('/milestones', milestoneRoutes);
router.use('/payments', paymentRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/admin', adminRoutes);
// M12: documents, audit history and notifications (full paths inside; mounted last).
router.use(activityRoutes);

export default router;
