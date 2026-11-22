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
  mineQuerySchema,
} from '../validators/order.validator';
import * as milestones from '../controllers/milestone.controller';
import * as inspections from '../controllers/inspection.controller';
import * as payments from '../controllers/payment.controller';
import * as ratings from '../controllers/rating.controller';
import { createMilestoneBodySchema } from '../validators/milestone.validator';
import { assignInspectorBodySchema, createInspectionBodySchema, saveDraftBodySchema } from '../validators/inspection.validator';
import { createPaymentBodySchema } from '../validators/payment.validator';
import { submitRatingBodySchema } from '../validators/rating.validator';

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
  validate({ query: mineQuerySchema }),
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

// I5 sub-resources. Participant / inspector / admin scoping is checked in each service.
const orderParams = { params: orderIdParamsSchema };

router.post('/:orderId/milestones', authorize('WORKSHOP'), validate({ ...orderParams, body: createMilestoneBodySchema }), milestones.create);
router.get('/:orderId/milestones', authorize('BUYER', 'WORKSHOP'), validate(orderParams), milestones.list);

router.post('/:orderId/inspections', authorize('INSPECTOR'), validate({ ...orderParams, body: createInspectionBodySchema }), inspections.create);
router.get('/:orderId/inspections', authorize('BUYER', 'WORKSHOP', 'INSPECTOR', 'ADMIN'), validate(orderParams), inspections.list);

// M11 private inspection drafts (the currently assigned INSPECTOR only; checked in the service).
router.get('/:orderId/inspection-draft', authorize('INSPECTOR'), validate(orderParams), inspections.getDraft);
router.put('/:orderId/inspection-draft', authorize('INSPECTOR'), validate({ ...orderParams, body: saveDraftBodySchema }), inspections.saveDraft);
router.delete('/:orderId/inspection-draft', authorize('INSPECTOR'), validate({ ...orderParams, body: emptyBodySchema }), inspections.deleteDraft);

// B1 inspector assignment (ADMIN).
router.put('/:orderId/inspector', authorize('ADMIN'), validate({ ...orderParams, body: assignInspectorBodySchema }), inspections.assign);
router.delete('/:orderId/inspector', authorize('ADMIN'), validate({ ...orderParams, body: emptyBodySchema }), inspections.unassign);
router.get('/:orderId/inspector-assignments', authorize('ADMIN'), validate(orderParams), inspections.assignments);

router.post('/:orderId/payments', authorize('BUYER'), validate({ ...orderParams, body: createPaymentBodySchema }), payments.create);
router.get('/:orderId/payments', authorize('BUYER', 'WORKSHOP'), validate(orderParams), payments.list);

router.post('/:orderId/rating', authorize('BUYER'), validate({ ...orderParams, body: submitRatingBodySchema }), ratings.submit);

router.get(
  '/:orderId',
  authorize('BUYER', 'WORKSHOP', 'INSPECTOR'), // INSPECTOR: currently assigned only, no payments
  validate({ params: orderIdParamsSchema }),
  orderController.getById,
);

export default router;
