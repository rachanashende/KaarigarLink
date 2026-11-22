import { Router } from 'express';
import * as c from '../controllers/admin.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { adminListQuery } from '../validators/admin.validator';

/** Mounted at /api/admin (M10). Read-only, ADMIN only, paginated. */
const router = Router();
router.use(authenticate, authorize('ADMIN'));

const list = validate({ query: adminListQuery });
router.get('/users', list, c.users);
router.get('/orders', list, c.orders);
router.get('/quotes', list, c.quotes);
router.get('/invitations', list, c.invitations);
router.get('/workshops', list, c.workshops);

export default router;
