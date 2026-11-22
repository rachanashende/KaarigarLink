import { Router } from 'express';
import * as c from '../controllers/payment.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { paymentIdParamsSchema, simulatePaymentBodySchema } from '../validators/payment.validator';

/** Mounted at /api/payments. Create/list live under /api/orders/:orderId/payments. */
const router = Router();
router.use(authenticate);

router.post('/:paymentId/simulate', authorize('BUYER'), validate({ params: paymentIdParamsSchema, body: simulatePaymentBodySchema }), c.simulate);

export default router;
