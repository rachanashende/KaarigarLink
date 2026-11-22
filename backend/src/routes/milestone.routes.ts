import { Router } from 'express';
import * as c from '../controllers/milestone.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { milestoneIdParamsSchema, updateMilestoneBodySchema } from '../validators/milestone.validator';
import { emptyBodySchema } from '../validators/order.validator';

/** Mounted at /api/milestones. Create/list live under /api/orders/:orderId/milestones. */
const router = Router();
router.use(authenticate);

const empty = validate({ params: milestoneIdParamsSchema, body: emptyBodySchema });

router.patch('/:milestoneId', authorize('WORKSHOP'), validate({ params: milestoneIdParamsSchema, body: updateMilestoneBodySchema }), c.update);
router.post('/:milestoneId/start', authorize('WORKSHOP'), empty, c.start);
router.post('/:milestoneId/complete', authorize('WORKSHOP'), empty, c.complete);
router.post('/:milestoneId/approve', authorize('BUYER'), empty, c.approve);

export default router;
