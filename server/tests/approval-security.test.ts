import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import { tools } from '../src/agent/tools.js';
import { db, verifyAuditChain, canonicalStringify, calculateSha256 } from '../src/db/schema.js';
import { SwitchAgentClient } from '../src/switch/client.js';
import { SwitchSimulatorAdapter } from '../src/switch/adapter.js';
import { OperationsAgentEngine } from '../src/agent/engine.js';
import { createApiRouter } from '../src/routes/api.js';
import { LOCAL_PERSONAS, requireAuth, requirePermission, authenticateToken } from '../src/auth/index.js';

describe('Human Approval & Security Guardrail Enforcement', () => {
  let app: express.Express;
  let agentEngine: OperationsAgentEngine;
  let switchClient: SwitchAgentClient;
  let simulator: SwitchSimulatorAdapter;

  // In-memory HTTP dispatcher for Express (avoids TCP socket sandbox restrictions)
  function dispatch(
    method: string,
    path: string,
    options: { headers?: Record<string, string>; body?: any } = {}
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve) => {
      let statusCode = 200;
      let responseBody: any = null;

      const req: any = {
        method: method.toUpperCase(),
        url: path,
        originalUrl: path,
        headers: Object.fromEntries(
          Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        ),
        body: options.body || {},
      };

      const res: any = {
        statusCode: 200,
        status(code: number) {
          statusCode = code;
          this.statusCode = code;
          return this;
        },
        setHeader() {
          return this;
        },
        json(data: any) {
          responseBody = data;
          resolve({ status: statusCode, body: responseBody });
          return this;
        },
        send(data: any) {
          responseBody = data;
          resolve({ status: statusCode, body: responseBody });
          return this;
        },
        end() {
          resolve({ status: statusCode, body: responseBody });
        },
      };

      app(req, res, (err?: any) => {
        if (err) {
          resolve({ status: err.statusCode || 500, body: { error: err.message } });
        } else {
          resolve({ status: 404, body: { error: 'Not Found' } });
        }
      });
    });
  }

  beforeAll(() => {
    switchClient = new SwitchAgentClient({
      agentId: 'switchops-ai',
      rooms: ['incidents-ops'],
    });
    simulator = new SwitchSimulatorAdapter();
    agentEngine = new OperationsAgentEngine(switchClient);

    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(switchClient, simulator, agentEngine));
  });

  beforeEach(() => {
    db.exec(`
      DELETE FROM approvals;
      DELETE FROM incident_tasks;
      DELETE FROM incidents;
      DELETE FROM audit_logs;
      DELETE FROM switch_events;
    `);
  });

  // 1. Authentication Check
  it('rejects unauthenticated approval decision attempts with 401 UNAUTHENTICATED', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    const res = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: { 'Content-Type': 'application/json' },
      body: { approved: true },
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHENTICATED');
  });

  // 2. Authorization Check (Role-based)
  it('rejects unauthorized reviewer approval attempt on critical action with 403 FORBIDDEN', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    // Sarah Kumar (token-sarah-platform) is an operator, lacks 'approve_critical'
    const resSarah = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-sarah-platform`,
      },
      body: { approved: true, reviewerNotes: 'Trying to approve critical' },
    });

    expect(resSarah.status).toBe(403);
    expect(resSarah.body.error).toBe('FORBIDDEN');
    expect(resSarah.body.message).toContain('not authorized to approve critical risk operations');

    // Guest Observer (token-guest-viewer) has only 'read'
    const resGuest = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-guest-viewer`,
      },
      body: { approved: true },
    });

    expect(resGuest.status).toBe(403);
    expect(resGuest.body.error).toBe('FORBIDDEN');
  });

  // 3. Authorized Approval & Execution
  it('permits authorized incident commander to approve, transitions to executed, and completes remediation', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    // Alex Chen (token-alex-sre-lead) has 'approve_critical'
    const res = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-alex-sre-lead`,
      },
      body: {
        approved: true,
        reviewerNotes: 'Headroom verified; executing cluster scale.',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('executed');

    // Verify DB state
    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(apprResult.data.approvalId) as any;
    expect(approval.status).toBe('executed');
    expect(approval.approved_by).toBe('Alex Chen');

    const incident = db.prepare('SELECT status FROM incidents WHERE id = ?').get(incResult.data.incidentId) as any;
    expect(incident.status).toBe('resolved');
  });

  // 4. Rejection Permanence
  it('enforces rejection permanence: once rejected, subsequent approval attempts fail with 409 CONFLICT', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    // 1. Reject approval
    const resReject = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-alex-sre-lead`,
      },
      body: {
        approved: false,
        reviewerNotes: 'Aborting remediation; customer traffic declining naturally.',
      },
    });

    expect(resReject.status).toBe(200);
    expect(resReject.body.status).toBe('rejected');

    // 2. Attempt subsequent approval -> MUST BE REFUSED WITH 409
    const resApproveAfterReject = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-alex-sre-lead`,
      },
      body: {
        approved: true,
        reviewerNotes: 'Trying to approve rejected action',
      },
    });

    expect(resApproveAfterReject.status).toBe(409);
    expect(resApproveAfterReject.body.error).toBe('CONFLICT');
    expect(resApproveAfterReject.body.message).toContain('was permanently rejected');

    // Incident must remain unresolved
    const incident = db.prepare('SELECT status FROM incidents WHERE id = ?').get(incResult.data.incidentId) as any;
    expect(incident.status).toBe('investigating');
  });

  // 5. Replay Attack & Concurrent Double-Execution Prevention
  it('prevents replay attacks on already executed tickets and prevents concurrent double-execution', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    // Run two concurrent decisions via engine
    const [first, second] = await Promise.allSettled([
      agentEngine.handleHumanApprovalDecision(
        apprResult.data.approvalId,
        true,
        LOCAL_PERSONAS['token-alex-sre-lead'],
        'First concurrent call'
      ),
      agentEngine.handleHumanApprovalDecision(
        apprResult.data.approvalId,
        true,
        LOCAL_PERSONAS['token-alex-sre-lead'],
        'Second concurrent call'
      ),
    ]);

    // Exactly one should succeed and one should fail with conflict
    const succeeded = [first, second].filter((r) => r.status === 'fulfilled');
    const rejected = [first, second].filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason.statusCode).toBe(409);
    }

    // Attempting a third replay call via HTTP API must return 409
    const resReplay = await dispatch('POST', `/api/approvals/${apprResult.data.approvalId}/decide`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer token-alex-sre-lead`,
      },
      body: { approved: true, reviewerNotes: 'Replay attempt' },
    });

    expect(resReplay.status).toBe(409);
    expect(resReplay.body.error).toBe('CONFLICT');
    expect(resReplay.body.message).toContain('already executed');
  });

  // 6. Execution Safety: Cryptographic Payload Tampering Detection
  it('detects payload tampering and refuses remediation execution with INTEGRITY_VIOLATION', async () => {
    const incResult = tools.create_incident({
      title: 'Payment Gateway Spike',
      description: '503 connection errors',
      priority: 'P1',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    const approvalId = apprResult.data.approvalId;

    // Simulate database tampering: Attacker changes target_max from 150 to 9999 without updating payload_hash
    db.prepare(`
      UPDATE approvals
      SET action_payload = ?, status = 'executing'
      WHERE id = ?
    `).run(JSON.stringify({ current_max: 50, target_max: 9999 }), approvalId);

    // Attempt execution
    const execution = await tools.execute_approved_remediation(approvalId, 'Alex Chen');

    expect(execution.success).toBe(false);
    expect(execution.error).toContain('INTEGRITY_VIOLATION');
    expect(execution.error).toContain('Cryptographic payload hash mismatch');

    // Incident must NOT be resolved
    const incident = db.prepare('SELECT status FROM incidents WHERE id = ?').get(incResult.data.incidentId) as any;
    expect(incident.status).toBe('investigating');
  });

  // 7. Execution Safety: Nonexistent Incident Target Validation
  it('refuses remediation when target incident ID does not exist in the database', async () => {
    const incResult = tools.create_incident({
      title: 'Orphan Incident',
      description: 'Testing orphan incident deletion',
      priority: 'P2',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const apprResult = tools.request_human_approval({
      incidentId: incResult.data.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Restart 5 containers.',
    });

    const approvalId = apprResult.data.approvalId;

    // Temporarily disable foreign keys to delete the incident row, creating an orphan approval
    db.exec('PRAGMA foreign_keys = OFF;');
    db.prepare('DELETE FROM incidents WHERE id = ?').run(incResult.data.incidentId);
    db.exec('PRAGMA foreign_keys = ON;');

    // Transition approval to executing so it can attempt execution
    db.prepare("UPDATE approvals SET status = 'executing' WHERE id = ?").run(approvalId);

    const execution = await tools.execute_approved_remediation(approvalId, 'Alex Chen');

    expect(execution.success).toBe(false);
    expect(execution.error).toContain('TARGET_INCIDENT_NOT_FOUND');
    expect(execution.error).toContain('does not exist');
  });

  // 8. Audit Trail: Tamper-Evident SHA-256 Hash Chaining
  it('validates intact audit log hash chains and detects any row modification as broken', () => {
    // 1. Generate legitimate audit entries
    tools.create_incident({
      title: 'Audit Incident',
      description: 'Testing audit chain',
      priority: 'P2',
      service: 'payment-service',
      roomId: 'incidents-ops',
      reporter: 'Alex Chen',
    });

    const initialVerify = verifyAuditChain();
    expect(initialVerify.verified).toBe(true);
    expect(initialVerify.totalRecords).toBeGreaterThanOrEqual(1);
    expect(initialVerify.headHash).toBeDefined();

    // 2. Tamper with an existing audit log entry in the database
    const oldestLog = db.prepare('SELECT id FROM audit_logs ORDER BY rowid ASC LIMIT 1').get() as any;
    db.prepare('UPDATE audit_logs SET actor = ? WHERE id = ?').run('malicious_actor', oldestLog.id);

    // 3. Verify that verifyAuditChain detects the tampering
    const tamperedVerify = verifyAuditChain();
    expect(tamperedVerify.verified).toBe(false);
    expect(tamperedVerify.brokenAt).toBeDefined();
    expect(tamperedVerify.brokenAt?.id).toBe(oldestLog.id);
  });

  // 9. Reset Route Authorization Protection
  it('protects privileged demo reset route with authentication and admin_reset permission', async () => {
    // Unauthenticated reset attempt -> 401
    const resUnauth = await dispatch('POST', '/api/switch/scenario/reset');
    expect(resUnauth.status).toBe(401);
    expect(resUnauth.body.error).toBe('UNAUTHENTICATED');

    // Non-admin user (Sarah Kumar) reset attempt -> 403
    const resNonAdmin = await dispatch('POST', '/api/switch/scenario/reset', {
      headers: { Authorization: 'Bearer token-sarah-platform' },
    });
    expect(resNonAdmin.status).toBe(403);
    expect(resNonAdmin.body.error).toBe('FORBIDDEN');
    expect(resNonAdmin.body.message).toContain('admin_reset');

    // Admin user (Alex Chen) reset attempt -> 200
    const resAdmin = await dispatch('POST', '/api/switch/scenario/reset', {
      headers: { Authorization: 'Bearer token-alex-sre-lead' },
    });
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.success).toBe(true);
  });
});
