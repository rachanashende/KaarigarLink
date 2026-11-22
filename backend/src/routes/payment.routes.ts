import { Router } from 'express';
import * as c from '../controllers/payment.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { paymentIdParamsSchema, simulatePaymentBodySchema } from '../validators/payment.validator';
import { emptyBodySchema } from '../validators/order.validator';

/** Mounted at /api/payments. Create/list live under /api/orders/:orderId/payments. */
const router = Router();
router.use(authenticate);

router.post('/:paymentId/simulate', authorize('BUYER'), validate({ params: paymentIdParamsSchema, body: simulatePaymentBodySchema }), c.simulate);
// B3: ownership (awarded workshop) is checked in the service.
router.post('/:paymentId/refund', authorize('ADMIN', 'WORKSHOP'), validate({ params: paymentIdParamsSchema, body: emptyBodySchema }), c.refund);

export default router;
