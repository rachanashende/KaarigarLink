import { Router } from 'express';
import * as c from '../controllers/job.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createJobSchema, jobIdParams, listJobsQuery, updateJobSchema } from '../validators/job.validator';

const router = Router();

router.use(authenticate);

router.post('/', authorize('BUYER'), validate({ body: createJobSchema }), c.createJob);
router.get('/', authorize('BUYER', 'ADMIN'), validate({ query: listJobsQuery }), c.listJobs);
// Any authenticated role; visibility (owner / admin / invited workshop) is checked in the service.
router.get('/:id', validate({ params: jobIdParams }), c.getJob);
router.put('/:id', authorize('BUYER'), validate({ params: jobIdParams, body: updateJobSchema }), c.updateJob);

// Matching routes (POST /:jobId/match, GET /:jobId/matches) are added in M8.

export default router;
