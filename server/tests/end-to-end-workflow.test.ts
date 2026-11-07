import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/schema.js';
import { SwitchAgentClient } from '../src/switch/client.js';
import { SwitchSimulatorAdapter } from '../src/switch/adapter.js';
import { OperationsAgentEngine } from '../src/agent/engine.js';
import { LOCAL_PERSONAS } from '../src/auth/index.js';

describe('Phase 3 End-to-End Incident Response Workflow', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM approvals;
      DELETE FROM incident_tasks;
      DELETE FROM incidents;
      DELETE FROM audit_logs;
      DELETE FROM switch_events;
    `);
  });

  it('runs complete triage, diagnostic investigation, approval gating, and remediation verification', async () => {
    // 1. Setup Switch Client, Simulator Adapter, and Agent Engine
    const switchClient = new SwitchAgentClient({
      agentId: 'switchops-ai',
      rooms: ['incidents-ops', 'checkout-team'],
    });

    const simulator = new SwitchSimulatorAdapter();
    const agentEngine = new OperationsAgentEngine(switchClient);

    const roomOutbox: string[] = [];
    switchClient.on('room_message_broadcast', (msg) => {
      roomOutbox.push(msg.body);
    });

    // 2. Step 1: Inbound message from a team member in Switch room
    const inboundPrompt = '@switchops-ai Payment checkout is failing with 503 errors and DB connection pool errors in production!';
    const simMsg = simulator.simulateInboundMessage('incidents-ops', 'Alex Chen', inboundPrompt);
    expect(simMsg.senderName).toBe('Alex Chen');

    // 3. Step 2 & 3: Agent processes message, acknowledges, investigates with tools, creates incident & tasks
    const workflowOutcome = await agentEngine.processInboundMessage({
      roomId: 'incidents-ops',
      sender: simMsg.sender,
      senderName: simMsg.senderName,
      text: inboundPrompt,
      messageId: simMsg.id,
    });

    expect(workflowOutcome.incidentId).toBeDefined();
    expect(workflowOutcome.approvalId).toBeDefined();

    // Verify acknowledgment was dispatched
    expect(roomOutbox.length).toBeGreaterThanOrEqual(1);
    expect(roomOutbox[0]).toContain('SwitchOps AI Acknowledged');

    // Verify diagnostic message was posted to Switch room
    expect(roomOutbox[1]).toContain('SwitchOps Incident Investigation Report');
    expect(roomOutbox[1]).toContain('Human Approval Gate');

    // 4. Verify incident is created in database with P1 severity
    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(workflowOutcome.incidentId) as any;
    expect(incident).toBeDefined();
    expect(incident.priority).toBe('P1');
    expect(incident.status).toBe('investigating');
    expect(incident.service).toBe('payment-service');

    // 5. Verify tasks are created
    const tasks = db.prepare('SELECT * FROM incident_tasks WHERE incident_id = ?').all(workflowOutcome.incidentId) as any[];
    expect(tasks.length).toBe(3);

    // 6. Verify sensitive action is held in pending approval status
    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(workflowOutcome.approvalId) as any;
    expect(approval).toBeDefined();
    expect(approval.status).toBe('pending');
    expect(approval.risk_level).toBe('critical');
    expect(approval.action_name).toBe('scale_db_pool_and_restart');

    // 7. Human grants approval
    const decisionResult = await agentEngine.handleHumanApprovalDecision(
      workflowOutcome.approvalId,
      true,
      LOCAL_PERSONAS['token-alex-sre-lead'],
      'Headroom verified; authorized to scale connection pool.'
    );

    expect(decisionResult.success).toBe(true);
    expect(decisionResult.status).toBe('executed');

    // 8. Verify post-remediation status
    const resolvedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(workflowOutcome.incidentId) as any;
    expect(resolvedIncident.status).toBe('resolved');
    expect(resolvedIncident.resolved_at).toBeDefined();

    // Verify resolution broadcast to Switch room
    const lastBroadcast = roomOutbox[roomOutbox.length - 1];
    expect(lastBroadcast).toContain('Emergency Remediation Verified');
    expect(lastBroadcast).toContain('RESOLVED');

    // 9. Verify complete audit trail
    const auditCount = db.prepare('SELECT count(*) as count FROM audit_logs WHERE incident_id = ?').get(workflowOutcome.incidentId) as any;
    expect(auditCount.count).toBeGreaterThanOrEqual(4);
  });
});
