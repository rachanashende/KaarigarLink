
import { Router } from 'express';
import * as quoteController from '../controllers/quote.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createQuoteBodySchema,
  updateQuoteBodySchema,
  withdrawQuoteBodySchema,
  invitationIdParamsSchema,
  quoteIdParamsSchema,
  jobIdParamsSchema,
} from '../validators/quote.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/invitations/:invitationId',
  authorize('WORKSHOP'),
  validate({ params: invitationIdParamsSchema, body: createQuoteBodySchema }),
  quoteController.create,
);

router.get(
  '/mine',
  authorize('WORKSHOP'),
  quoteController.mine,
);

router.get(
  '/jobs/:jobId',
  authorize('BUYER'),
  validate({ params: jobIdParamsSchema }),
  quoteController.listForJob,
);

router.patch(
  '/:quoteId',
  authorize('WORKSHOP'),
  validate({ params: quoteIdParamsSchema, body: updateQuoteBodySchema }),
  quoteController.update,
);

// M10: the workshop withdraws its own SUBMITTED quote (no body).
router.post(
  '/:quoteId/withdraw',
  authorize('WORKSHOP'),
  validate({ params: quoteIdParamsSchema, body: withdrawQuoteBodySchema }),
  quoteController.withdraw,
);

export default router;
