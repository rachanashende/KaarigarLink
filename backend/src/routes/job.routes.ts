import { Router } from 'express';
import * as c from '../controllers/job.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createJobSchema, jobIdParams, listJobsQuery, updateJobSchema } from '../validators/job.validator';
import * as matching from '../controllers/matching.controller';
import { matchesQuery } from '../validators/matching.validator';
import * as invitations from '../controllers/invitation.controller';
import { inviteWorkshopSchema, jobInvitationsQuery } from '../validators/invitation.validator';

const router = Router();

router.use(authenticate);

router.post('/', authorize('BUYER'), validate({ body: createJobSchema }), c.createJob);
router.get('/', authorize('BUYER', 'ADMIN'), validate({ query: listJobsQuery }), c.listJobs);
// Any authenticated role; visibility (owner / admin / invited workshop) is checked in the service.
router.get('/:id', validate({ params: jobIdParams }), c.getJob);
router.put('/:id', authorize('BUYER'), validate({ params: jobIdParams, body: updateJobSchema }), c.updateJob);

// Matching (M7): read-only, computes ranked matches; creates no invitations.
router.get('/:id/matches', authorize('BUYER', 'ADMIN'), validate({ params: jobIdParams, query: matchesQuery }), matching.getJobMatches);

// Invitations (M8): manual buyer action; eligibility is re-checked server-side.
router.post('/:id/invitations', authorize('BUYER'), validate({ params: jobIdParams, body: inviteWorkshopSchema }), invitations.inviteWorkshop);
router.get('/:id/invitations', authorize('BUYER', 'ADMIN'), validate({ params: jobIdParams, query: jobInvitationsQuery }), invitations.listJobInvitations);

export default router;
