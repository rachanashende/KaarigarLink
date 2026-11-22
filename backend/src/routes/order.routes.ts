import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  awardBodySchema,
  cancelOrderBodySchema,
  emptyBodySchema,
  quoteIdParamsSchema,
  orderIdParamsSchema,
} from '../validators/order.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/award/:quoteId',
  authorize('BUYER'),
  validate({ params: quoteIdParamsSchema, body: awardBodySchema }),
  orderController.award,
);

// Before '/:orderId' so "mine" is not read as an order id.
router.get(
  '/mine',
  authorize('BUYER', 'WORKSHOP'),
  orderController.mine,
);

// I4b lifecycle. Ownership (awarded workshop / order's buyer) is checked in the service.
router.post(
  '/:orderId/start',
  authorize('WORKSHOP'),
  validate({ params: orderIdParamsSchema, body: emptyBodySchema }),
  orderController.start,
);

router.post(
  '/:orderId/complete',
  authorize('BUYER'),
  validate({ params: orderIdParamsSchema, body: emptyBodySchema }),
  orderController.complete,
);

router.post(
  '/:orderId/cancel',
  authorize('BUYER'),
  validate({ params: orderIdParamsSchema, body: cancelOrderBodySchema }),
  orderController.cancel,
);

router.get(
  '/:orderId',
  authorize('BUYER', 'WORKSHOP'),
  validate({ params: orderIdParamsSchema }),
  orderController.getById,
);

export default router;
