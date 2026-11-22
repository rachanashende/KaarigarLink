import { z } from 'zod';
import type { AuditEvent, Order } from '@/types';
import type { AdminService, AssignmentRecord } from '../admin';
import { api, apiAll } from './http';
import { createLiveAudit } from './platform';
import { auditActivity } from './buyer';
import {
  inspectionSchema, inspectionView, invitationSchema, invitationView, jobSchema, jobView, orderSchema, orderView,
  qcStatus, quoteSchema, quoteView, userSchema, userView, workshopSchema, workshopView,
} from './mappers';

const enc = encodeURIComponent;
const inspectionStatus = z.enum(['PASSED', 'FAILED', 'REWORK_REQUIRED']);
/** GET /admin/orders: milestones, the latest inspection status and the active assignment. */
const adminOrderSchema = orderSchema.omit({ job: true, quote: true, inspections: true }).extend({
  latestInspectionStatus: inspectionStatus.nullable(),
  activeAssignment: z.object({ inspectorId: z.string(), assignedAt: z.string() }).nullable(),
});
const adminInvitationSchema = invitationSchema.extend({ matchScore: z.number(), matchReasons: z.array(z.string()) });
const named = z.object({ id: z.string(), name: z.string() });
const assignmentSchema = z.object({
  id: z.string(), inspectorId: z.string(), assignedAt: z.string(), active: z.boolean().nullable(), endedAt: z.string().nullable(),
  inspector: named, assignedBy: named, endedBy: named.nullable(),
});

export function createLiveAdmin(): AdminService {
  return {
    async getOverview() {
      const [users, workshopRows, jobs, orders, inspections, quotes, invitations] = await Promise.all([
        apiAll('/admin/users', userSchema),
        // M11: full profiles in one paginated list (no per-workshop requests).
        apiAll('/admin/workshops', workshopSchema),
        apiAll('/jobs', jobSchema),
        apiAll('/admin/orders', adminOrderSchema),
        apiAll('/inspections', inspectionSchema),
        apiAll('/admin/quotes', quoteSchema),
        apiAll('/admin/invitations', adminInvitationSchema),
      ]);
      // M12: recent activity is the recorded audit history (newest 25).
      const audit = await createLiveAudit().list({ page: 1 });
      const workshops = workshopRows.map(workshopView);
      const orderViews: Order[] = orders.map(order => {
        const view = orderView(order);
        const latest = order.latestInspectionStatus;
        if (!latest) return view;
        return {
          ...view, qcStatus: qcStatus(latest),
          ...(order.status === 'IN_PROGRESS' ? { status: latest === 'PASSED' ? 'ACCEPTED' as const : 'REWORK' as const } : {}),
        };
      });
      const assignments = Object.fromEntries(orders.flatMap(order => order.activeAssignment ? [[order.id, order.activeAssignment] as const] : []));
      // Only events tied to an order or job link to admin records; the full history is on the audit page.
      const activity: AuditEvent[] = audit.items.flatMap(item => item.orderId
        ? [{ ...auditActivity(item), entityType: 'Order', entityId: item.orderId }]
        : item.jobId ? [{ ...auditActivity(item), entityType: 'Job', entityId: item.jobId }] : []);
      return {
        users: users.map(userView), workshops, jobs: jobs.map(job => jobView(job)), orders: orderViews,
        inspections: inspections.map(item => inspectionView(item)), quotes: quotes.map(quoteView),
        invitations: invitations.map(invitationView),
        // The backend stores the matching snapshot taken when each invitation was sent.
        matches: invitations.map(item => ({ jobId: item.jobId, workshopId: item.workshopId, score: item.matchScore, explanations: item.matchReasons, eligibility: { eligible: true, reasons: [] } })),
        activity, assignments,
      };
    },
    async verifyWorkshop(_adminId, workshopId, status) {
      await api('/workshops/' + enc(workshopId), z.unknown(), { method: 'PUT', body: { verificationStatus: status } });
    },
    async listInspectors() {
      const { inspectors } = await api('/inspections/inspectors', z.object({
        inspectors: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), activeAssignments: z.number() })),
      }));
      return inspectors;
    },
    async listAssignments(_adminId, orderId) {
      const { assignments } = await api('/orders/' + enc(orderId) + '/inspector-assignments', z.object({ assignments: z.array(assignmentSchema) }));
      return assignments.map((row): AssignmentRecord => ({
        id: row.id, inspectorId: row.inspectorId, inspectorName: row.inspector.name, assignedByName: row.assignedBy.name,
        assignedAt: row.assignedAt, active: row.active === true,
        ...(row.endedAt ? { endedAt: row.endedAt } : {}), ...(row.endedBy ? { endedByName: row.endedBy.name } : {}),
      }));
    },
    async assignInspector(_adminId, orderId, inspectorId) {
      await api('/orders/' + enc(orderId) + '/inspector', z.unknown(), { method: 'PUT', body: { inspectorId } });
    },
    async unassignInspector(_adminId, orderId) {
      await api('/orders/' + enc(orderId) + '/inspector', z.unknown(), { method: 'DELETE' });
    },
  };
}
