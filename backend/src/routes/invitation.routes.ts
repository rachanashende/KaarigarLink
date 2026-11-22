import { Router } from 'express';
import * as c from '../controllers/invitation.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { invitationIdParams, respondInvitationSchema } from '../validators/invitation.validator';

const router = Router();

router.use(authenticate);

// Invited workshop accepts or declines. Ownership is checked in the service.
router.post('/:id/respond', authorize('WORKSHOP'), validate({ params: invitationIdParams, body: respondInvitationSchema }), c.respondToInvitation);

export default router;
