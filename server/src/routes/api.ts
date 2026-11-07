import { Router } from 'express';
import { db, logAudit, verifyAuditChain } from '../db/schema.js';
import type { SwitchAgentClient } from '../switch/client.js';
import type { SwitchSimulatorAdapter } from '../switch/adapter.js';
import { OperationsAgentEngine, DecisionConflictError, AuthorizationError } from '../agent/engine.js';
import {
  LOCAL_PERSONAS,
  requireAuth,
  requirePermission,
  extractBearerToken,
  authenticateToken,
  type AuthenticatedRequest,
} from '../auth/index.js';

export function createApiRouter(
  switchClient: SwitchAgentClient,
  simulator: SwitchSimulatorAdapter,
  agentEngine: OperationsAgentEngine
) {
  const router = Router();

  // 1. Dashboard summary
  router.get('/dashboard/summary', (req, res) => {
    try {
      const incidentsTotal = db.prepare('SELECT count(*) as count FROM incidents').get() as any;
      const incidentsActive = db.prepare("SELECT count(*) as count FROM incidents WHERE status != 'resolved'").get() as any;
      const incidentsResolved = db.prepare("SELECT count(*) as count FROM incidents WHERE status = 'resolved'").get() as any;

      const approvalsPending = db.prepare("SELECT count(*) as count FROM approvals WHERE status = 'pending'").get() as any;
      const approvalsTotal = db.prepare('SELECT count(*) as count FROM approvals').get() as any;

      const tasksTotal = db.prepare('SELECT count(*) as count FROM incident_tasks').get() as any;
      const tasksCompleted = db.prepare("SELECT count(*) as count FROM incident_tasks WHERE status = 'completed'").get() as any;
      const tasksActive = db.prepare("SELECT count(*) as count FROM incident_tasks WHERE status != 'completed'").get() as any;

      const recentLogs = db.prepare('SELECT * FROM audit_logs ORDER BY rowid DESC LIMIT 10').all() as any[];

      res.json({
        incidents: {
          total: incidentsTotal.count,
          active: incidentsActive.count,
          resolved: incidentsResolved.count,
        },
        approvals: {
          pending: approvalsPending.count,
          total: approvalsTotal.count,
        },
        tasks: {
          total: tasksTotal.count,
          completed: tasksCompleted.count,
          active: tasksActive.count,
        },
        switchStatus: switchClient.getStatus(),
        recentLogs: recentLogs.map((l) => ({
          ...l,
          details: JSON.parse(l.details || '{}'),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Incidents
  router.get('/incidents', (req, res) => {
    try {
      const incidents = db.prepare('SELECT * FROM incidents ORDER BY rowid DESC').all() as any[];
      const withCounts = incidents.map((inc) => {
        const taskCounts = db.prepare(`
          SELECT 
            count(*) as total,
            sum(case when status = 'completed' then 1 else 0 end) as completed
          FROM incident_tasks WHERE incident_id = ?
        `).get(inc.id) as any;

        const pendingApproval = db.prepare(`
          SELECT count(*) as count FROM approvals WHERE incident_id = ? AND status = 'pending'
        `).get(inc.id) as any;

        return {
          ...inc,
          tasksTotal: taskCounts.total,
          tasksCompleted: taskCounts.completed || 0,
          hasPendingApproval: pendingApproval.count > 0,
        };
      });
      res.json(withCounts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/incidents/:id', (req, res) => {
    try {
      const incidentId = String(req.params.id);
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      const tasks = db.prepare('SELECT * FROM incident_tasks WHERE incident_id = ? ORDER BY rowid ASC').all(incidentId);
      const approvals = db.prepare('SELECT * FROM approvals WHERE incident_id = ? ORDER BY rowid DESC').all(incidentId) as any[];
      const audit = db.prepare('SELECT * FROM audit_logs WHERE incident_id = ? ORDER BY rowid ASC').all(incidentId) as any[];
      const trace = agentEngine.getTrace(incidentId);

      res.json({
        ...incident,
        tasks,
        approvals: approvals.map((a) => ({
          ...a,
          action_payload: JSON.parse(a.action_payload || '{}'),
        })),
        audit: audit.map((l) => ({
          ...l,
          details: JSON.parse(l.details || '{}'),
        })),
        trace,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Tasks
  router.get('/tasks', (req, res) => {
    try {
      const tasks = db.prepare(`
        SELECT t.*, i.title as incident_title, i.priority as incident_priority
        FROM incident_tasks t
        LEFT JOIN incidents i ON t.incident_id = i.id
        ORDER BY t.rowid DESC
      `).all();
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 0. Authentication & Personas
  router.get('/auth/me', (req, res) => {
    const token = extractBearerToken(req);
    const user = authenticateToken(token);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'No valid auth token provided' });
    }
    res.json(user);
  });

  router.get('/auth/personas', (_req, res) => {
    res.json(Object.values(LOCAL_PERSONAS));
  });

  router.patch('/tasks/:id', requireAuth, requirePermission('update_task'), (req: AuthenticatedRequest, res) => {
    try {
      const taskId = String(req.params.id);
      const { status } = req.body;
      db.prepare('UPDATE incident_tasks SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        new Date().toISOString(),
        taskId
      );
      logAudit('task_updated', req.user!.name, { taskId, status, userId: req.user!.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Approvals
  router.get('/approvals', (_req, res) => {
    try {
      const approvals = db.prepare(`
        SELECT a.*, i.title as incident_title, i.service as incident_service
        FROM approvals a
        LEFT JOIN incidents i ON a.incident_id = i.id
        ORDER BY a.rowid DESC
      `).all() as any[];

      res.json(
        approvals.map((a) => ({
          ...a,
          action_payload: JSON.parse(a.action_payload || '{}'),
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/approvals/:id/decide', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const approvalId = String(req.params.id);
      const { approved, reviewerNotes } = req.body;
      const result = await agentEngine.handleHumanApprovalDecision(
        approvalId,
        Boolean(approved),
        req.user!,
        reviewerNotes
      );
      res.json(result);
    } catch (err: any) {
      if (err instanceof AuthorizationError || err.statusCode === 403) {
        return res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      }
      if (err instanceof DecisionConflictError || err.statusCode === 409) {
        return res.status(409).json({ error: 'CONFLICT', message: err.message });
      }
      if (err.statusCode === 404 || err.message?.includes('not found')) {
        return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Audit logs
  router.get('/audit-logs', (_req, res) => {
    try {
      const logs = db.prepare('SELECT * FROM audit_logs ORDER BY rowid DESC LIMIT 100').all() as any[];
      res.json(
        logs.map((l) => ({
          ...l,
          details: JSON.parse(l.details || '{}'),
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/audit-logs/verify', (_req, res) => {
    try {
      const verification = verifyAuditChain();
      res.json(verification);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Switch Rooms and Messages
  router.get('/switch/rooms', (_req, res) => {
    res.json(simulator.getRooms());
  });

  router.get('/switch/rooms/:id/messages', (req, res) => {
    const roomId = String(req.params.id);
    res.json(simulator.getMessages(roomId));
  });

  router.post('/switch/rooms/:id/messages', (req, res) => {
    try {
      const roomId = String(req.params.id);
      const { senderName, body } = req.body;
      const msg = simulator.simulateInboundMessage(roomId, senderName || 'Alex Chen', body);
      res.json({ success: true, message: msg });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Demo scenario triggers
  router.post('/switch/scenario/trigger', async (req, res) => {
    try {
      const roomId = req.body.roomId || 'incidents-ops';
      const senderName = 'Alex Chen';
      const prompt = '@switchops-ai Payment checkout is throwing 503 errors and DB connection pool errors in production! Customers cannot complete checkout.';

      simulator.simulateInboundMessage(roomId, senderName, prompt);
      res.json({ success: true, message: 'Scenario triggered successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/switch/scenario/reset', requireAuth, requirePermission('admin_reset'), (req: AuthenticatedRequest, res) => {
    try {
      const preserveAudit = req.body?.preserveAudit !== false;
      db.exec(`
        DELETE FROM approvals;
        DELETE FROM incident_tasks;
        DELETE FROM incidents;
        DELETE FROM switch_events;
      `);
      if (!preserveAudit) {
        db.exec('DELETE FROM audit_logs;');
      }
      logAudit('system_reset', req.user!.name, { reason: 'Demo reset triggered', userId: req.user!.id, auditPreserved: preserveAudit });
      res.json({ success: true, message: preserveAudit ? 'Demo state reset (audit trail preserved)' : 'All demo data cleared' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
