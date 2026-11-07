import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { SwitchAgentClient } from '../src/switch/client.js';
import { SwitchSimulatorAdapter } from '../src/switch/adapter.js';
import { OperationsAgentEngine, DecisionConflictError } from '../src/agent/engine.js';
import { tools } from '../src/agent/tools.js';
import { db, verifyAuditChain, canonicalStringify, calculateSha256, GENESIS_HASH } from '../src/db/schema.js';
import { LOCAL_PERSONAS } from '../src/auth/index.js';

describe('Demo Workflow Verification: End-to-End Incident, Approval, & Audit Integrity', () => {
  let switchClient: SwitchAgentClient;
  let simulator: SwitchSimulatorAdapter;
  let agentEngine: OperationsAgentEngine;

  beforeEach(() => {
    db.exec(`
      DELETE FROM approvals;
      DELETE FROM incident_tasks;
      DELETE FROM incidents;
      DELETE FROM audit_logs;
      DELETE FROM switch_events;
    `);

    switchClient = new SwitchAgentClient({
      agentId: 'switchops-ai',
      rooms: ['incidents-ops', 'checkout-team'],
    });
    simulator = new SwitchSimulatorAdapter();
    agentEngine = new OperationsAgentEngine(switchClient);
  });

  it('verifies the full demo incident workflow, rejection refusal, single execution, and audit chaining', async () => {
    // =========================================================================
    // 1. Trigger the simulated P1 payment-service incident
    // =========================================================================
    const prompt = '@switchops-ai Payment checkout is throwing 503 errors and DB connection pool errors in production! Customers cannot complete checkout.';
    const inboundEvent = simulator.simulateInboundMessage('incidents-ops', 'Alex Chen', prompt);

    expect(inboundEvent.senderName).toBe('Alex Chen');
    expect(inboundEvent.addressed).toBe(true);

    const workflow = await agentEngine.processInboundMessage({
      roomId: 'incidents-ops',
      sender: inboundEvent.sender,
      senderName: inboundEvent.senderName,
      text: prompt,
      messageId: inboundEvent.id,
    });

    expect(workflow.incidentId).toBeDefined();
    expect(workflow.approvalId).toBeDefined();

    // =========================================================================
    // 2. Inspect the generated incident and diagnostic evidence
    // =========================================================================
    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(workflow.incidentId) as any;
    expect(incident).toBeDefined();
    expect(incident.priority).toBe('P1');
    expect(incident.status).toBe('investigating');
    expect(incident.service).toBe('payment-service');

    const trace = agentEngine.getTrace(workflow.incidentId);
    expect(trace.length).toBeGreaterThanOrEqual(4);

    const logTrace = trace.find((t) => t.toolUsed === 'query_service_logs' && t.status === 'completed');
    expect(logTrace?.details).toContain('ConnectionPoolTimeoutException');

    const metricTrace = trace.find((t) => t.toolUsed === 'inspect_service_metrics' && t.status === 'completed');
    expect(metricTrace?.details).toContain('50/50');

    const deployTrace = trace.find((t) => t.toolUsed === 'check_recent_deployments' && t.status === 'completed');
    expect(deployTrace?.details).toContain('v2.14.2');

    // Confirm sensitive action is held in pending approval status
    const pendingApproval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(workflow.approvalId) as any;
    expect(pendingApproval.status).toBe('pending');
    expect(pendingApproval.risk_level).toBe('critical');
    expect(pendingApproval.action_name).toBe('scale_db_pool_and_restart');
    expect(pendingApproval.payload_hash).toBeDefined();

    // =========================================================================
    // 3. Demonstrate that a rejected approval cannot execute remediation
    // =========================================================================
    const rejectOutcome = await agentEngine.handleHumanApprovalDecision(
      workflow.approvalId,
      false,
      LOCAL_PERSONAS['token-alex-sre-lead'],
      'Action cancelled: Traffic subsiding, observing metrics.'
    );

    expect(rejectOutcome.success).toBe(false);
    expect(rejectOutcome.status).toBe('rejected');

    // Attempting direct execution on rejected ticket must be blocked
    const executionAttemptOnRejected = await tools.execute_approved_remediation(workflow.approvalId, 'attacker');
    expect(executionAttemptOnRejected.success).toBe(false);
    expect(executionAttemptOnRejected.error).toContain("SECURITY REFUSAL: Action is permanently 'rejected'");

    // Attempting subsequent approval on rejected ticket must throw 409
    await expect(
      agentEngine.handleHumanApprovalDecision(
        workflow.approvalId,
        true,
        LOCAL_PERSONAS['token-alex-sre-lead'],
        'Trying to approve rejected action'
      )
    ).rejects.toThrow(DecisionConflictError);

    // Incident remains unresolved
    const incidentAfterReject = db.prepare('SELECT status FROM incidents WHERE id = ?').get(workflow.incidentId) as any;
    expect(incidentAfterReject.status).toBe('investigating');

    // =========================================================================
    // 4. Demonstrate that a valid authorized approval executes simulated remediation only once
    // =========================================================================
    // Trigger a second fresh approval for the remediation
    const secondApproval = tools.request_human_approval({
      incidentId: workflow.incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: { current_max: 50, target_max: 150 },
      riskLevel: 'critical',
      consequencesSummary: 'Requires rolling restart of 5 production containers.',
    });

    const secondApprId = secondApproval.data.approvalId;

    // Authorized incident commander Alex Chen approves
    const approveOutcome = await agentEngine.handleHumanApprovalDecision(
      secondApprId,
      true,
      LOCAL_PERSONAS['token-alex-sre-lead'],
      'Authorized by incident commander after capacity check.'
    );

    expect(approveOutcome.success).toBe(true);
    expect(approveOutcome.status).toBe('executed');
    expect(approveOutcome.executionResult.data.simulated).toBe(true);
    expect(approveOutcome.executionResult.data.new_pool_size).toBe(150);

    // Incident is now resolved
    const incidentAfterApproval = db.prepare('SELECT status, resolved_at FROM incidents WHERE id = ?').get(workflow.incidentId) as any;
    expect(incidentAfterApproval.status).toBe('resolved');
    expect(incidentAfterApproval.resolved_at).toBeDefined();

    // Replay attempt must be rejected with Conflict
    await expect(
      agentEngine.handleHumanApprovalDecision(
        secondApprId,
        true,
        LOCAL_PERSONAS['token-alex-sre-lead'],
        'Replay call'
      )
    ).rejects.toThrow(/already executed/);

    // Direct execution call must be blocked
    const directExecutionReplay = await tools.execute_approved_remediation(secondApprId, 'attacker');
    expect(directExecutionReplay.success).toBe(false);
    expect(directExecutionReplay.error).toContain("already been 'executed'");

    // =========================================================================
    // 5. Verify the audit hash chain on the generated events
    // =========================================================================
    const chainVerification = verifyAuditChain();
    expect(chainVerification.verified).toBe(true);
    expect(chainVerification.totalRecords).toBeGreaterThanOrEqual(5);
    expect(chainVerification.headHash).toBeDefined();
  });

  // =========================================================================
  // 6. Demonstrate detection of tampered and deleted audit entries using an isolated fixture
  // =========================================================================
  it('detects tampered and deleted audit entries using an isolated in-memory test fixture', () => {
    const fixtureDb = new DatabaseSync(':memory:');
    fixtureDb.exec(`
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        incident_id TEXT,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL
      );
    `);

    // Helper to log with hash chaining in the isolated fixture
    function logFixtureAudit(eventType: string, actor: string, details: Record<string, any>): string {
      const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = new Date().toISOString();
      const canonical = canonicalStringify(details);

      const last = fixtureDb
        .prepare('SELECT entry_hash FROM audit_logs ORDER BY rowid DESC LIMIT 1')
        .get() as { entry_hash?: string } | undefined;

      const prevHash = last?.entry_hash || GENESIS_HASH;
      const hashPayload = `${prevHash}|${id}||${eventType}|${actor}|${canonical}|${timestamp}`;
      const entryHash = calculateSha256(hashPayload);

      fixtureDb.prepare(`
        INSERT INTO audit_logs (id, incident_id, event_type, actor, details, timestamp, prev_hash, entry_hash)
        VALUES (?, null, ?, ?, ?, ?, ?, ?)
      `).run(id, eventType, actor, canonical, timestamp, prevHash, entryHash);

      return id;
    }

    // Helper to verify isolated fixture chain
    function verifyFixtureChain(): { verified: boolean; brokenAt?: any } {
      const logs = fixtureDb.prepare('SELECT * FROM audit_logs ORDER BY rowid ASC').all() as any[];
      let expectedPrev = GENESIS_HASH;

      for (const row of logs) {
        if (row.prev_hash !== expectedPrev) {
          return { verified: false, brokenAt: { id: row.id, reason: 'prev_hash mismatch' } };
        }
        const canonical = canonicalStringify(JSON.parse(row.details));
        const expectedHash = calculateSha256(`${row.prev_hash}|${row.id}||${row.event_type}|${row.actor}|${canonical}|${row.timestamp}`);
        if (expectedHash !== row.entry_hash) {
          return { verified: false, brokenAt: { id: row.id, reason: 'entry_hash mismatch' } };
        }
        expectedPrev = row.entry_hash;
      }
      return { verified: true };
    }

    // 1. Build a valid 3-record chain in the isolated fixture
    const id1 = logFixtureAudit('incident_created', 'Alex Chen', { priority: 'P1' });
    const id2 = logFixtureAudit('approval_requested', 'SwitchOps AI', { action: 'scale_db_pool' });
    const id3 = logFixtureAudit('remediation_executed', 'Alex Chen', { status: 'completed' });

    expect(verifyFixtureChain().verified).toBe(true);

    // 2. Tamper with record 1 (alter actor) -> MUST BE DETECTED
    fixtureDb.prepare('UPDATE audit_logs SET actor = ? WHERE id = ?').run('malicious_impersonator', id1);
    const tamperedResult = verifyFixtureChain();
    expect(tamperedResult.verified).toBe(false);
    expect(tamperedResult.brokenAt?.id).toBe(id1);
    expect(tamperedResult.brokenAt?.reason).toBe('entry_hash mismatch');

    // Restore record 1 actor so it matches hash again
    fixtureDb.prepare('UPDATE audit_logs SET actor = ? WHERE id = ?').run('Alex Chen', id1);
    expect(verifyFixtureChain().verified).toBe(true);

    // 3. Delete intermediate record 2 -> MUST BE DETECTED
    fixtureDb.prepare('DELETE FROM audit_logs WHERE id = ?').run(id2);
    const deletedResult = verifyFixtureChain();
    expect(deletedResult.verified).toBe(false);
    expect(deletedResult.brokenAt?.id).toBe(id3);
    expect(deletedResult.brokenAt?.reason).toBe('prev_hash mismatch');
  });
});
