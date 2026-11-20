import { Router } from 'express';
import * as c from '../controllers/workshop.controller';
import * as invitations from '../controllers/invitation.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  capabilityParams,
  capacityParams,
  createCapabilitySchema,
  createCapacitySchema,
  createMachineSchema,
  createWorkshopSchema,
  listWorkshopsQuery,
  machineParams,
  updateCapabilitySchema,
  updateCapacitySchema,
  updateMachineSchema,
  updateWorkshopSchema,
  workshopIdParams,
} from '../validators/workshop.validator';
import { workshopInvitationsQuery } from '../validators/invitation.validator';

const router = Router();
const manage = authorize('WORKSHOP', 'ADMIN'); // ownership is checked in the service

router.use(authenticate);

// Static paths must come before "/:id".
router.get('/me', authorize('WORKSHOP'), c.getMyWorkshop);
router.get('/invitations', authorize('WORKSHOP'), validate({ query: workshopInvitationsQuery }), invitations.listMyInvitations);

router.get('/', validate({ query: listWorkshopsQuery }), c.listWorkshops);
router.post('/', authorize('WORKSHOP'), validate({ body: createWorkshopSchema }), c.createWorkshop);
router.get('/:id', validate({ params: workshopIdParams }), c.getWorkshop);
router.put('/:id', manage, validate({ params: workshopIdParams, body: updateWorkshopSchema }), c.updateWorkshop);

// Machines
router.get('/:id/machines', validate({ params: workshopIdParams }), c.listMachines);
router.post('/:id/machines', manage, validate({ params: workshopIdParams, body: createMachineSchema }), c.createMachine);
router.put('/:id/machines/:machineId', manage, validate({ params: machineParams, body: updateMachineSchema }), c.updateMachine);
router.delete('/:id/machines/:machineId', manage, validate({ params: machineParams }), c.deleteMachine);

// Capabilities
router.get('/:id/capabilities', validate({ params: workshopIdParams }), c.listCapabilities);
router.post('/:id/capabilities', manage, validate({ params: workshopIdParams, body: createCapabilitySchema }), c.createCapability);
router.put('/:id/capabilities/:capabilityId', manage, validate({ params: capabilityParams, body: updateCapabilitySchema }), c.updateCapability);
router.delete('/:id/capabilities/:capabilityId', manage, validate({ params: capabilityParams }), c.deleteCapability);

// Capacity windows
router.get('/:id/capacity', validate({ params: workshopIdParams }), c.listCapacity);
router.post('/:id/capacity', manage, validate({ params: workshopIdParams, body: createCapacitySchema }), c.createCapacity);
router.put('/:id/capacity/:capacityId', manage, validate({ params: capacityParams, body: updateCapacitySchema }), c.updateCapacity);
router.delete('/:id/capacity/:capacityId', manage, validate({ params: capacityParams }), c.deleteCapacity);

export default router;
