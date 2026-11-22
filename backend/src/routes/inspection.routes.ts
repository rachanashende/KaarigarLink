import { Router } from 'express';
import * as c from '../controllers/inspection.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { assignedOrdersQuery, listInspectionsQuery } from '../validators/inspection.validator';

/**
 * Mounted at /api/inspections (B1). Per-order create/history live under
 * /api/orders/:orderId/inspections; assignment under /api/orders/:orderId/inspector.
 */
const router = Router();
router.use(authenticate);

router.get('/assigned', authorize('INSPECTOR'), validate({ query: assignedOrdersQuery }), c.assignedToMe);
router.get('/inspectors', authorize('ADMIN'), c.inspectors);
router.get('/', authorize('ADMIN'), validate({ query: listInspectionsQuery }), c.listAll);

export default router;
