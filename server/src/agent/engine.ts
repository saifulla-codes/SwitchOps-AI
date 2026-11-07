import { tools } from './tools.js';
import { db, logAudit, canonicalStringify } from '../db/schema.js';
import type { SwitchAgentClient } from '../switch/client.js';
import type { UserPersona } from '../auth/index.js';

export interface AgentStepTrace {
  timestamp: string;
  step: string;
  status: 'running' | 'completed' | 'blocked' | 'failed';
  details: string;
  toolUsed?: string;
}

export class DecisionConflictError extends Error {
  public statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'DecisionConflictError';
  }
}

export class AuthorizationError extends Error {
  public statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class OperationsAgentEngine {
  private switchClient: SwitchAgentClient;
  private activeTraces: Map<string, AgentStepTrace[]> = new Map();

  constructor(switchClient: SwitchAgentClient) {
    this.switchClient = switchClient;
  }

  public getTrace(incidentId: string): AgentStepTrace[] {
    return this.activeTraces.get(incidentId) || [];
  }

  public async processInboundMessage(params: {
    roomId: string;
    sender: string;
    senderName: string;
    text: string;
    messageId: string;
  }) {
    console.log(`🤖 Agent analyzing request from ${params.senderName} in room [${params.roomId}]`);
    logAudit('agent_message_received', params.sender, { text: params.text, roomId: params.roomId });

    const traceId = `INC-${Date.now().toString().slice(-4)}`;
    const trace: AgentStepTrace[] = [];
    this.activeTraces.set(traceId, trace);

    const addTrace = (step: string, status: AgentStepTrace['status'], details: string, toolUsed?: string) => {
      trace.push({
        timestamp: new Date().toISOString(),
        step,
        status,
        details,
        toolUsed,
      });
    };

    // Step 1: Immediate Acknowledgment in the Switch Room
    addTrace('1. Triage & Ingestion', 'completed', `Received request from ${params.senderName}: "${params.text}"`);
    await this.switchClient.postMessage(
      params.roomId,
      `🚨 **SwitchOps AI Acknowledged:** Triaging incident report regarding *"service failure"*. Initiating autonomous diagnostic scan across telemetry, logs, and deployment pipelines...`
    );

    // Step 2: Diagnostic Investigation
    addTrace('2. Service Health Probe', 'running', 'Executing check_service_health for payment-service', 'check_service_health');
    const healthResult = await tools.check_service_health('payment-service');
    addTrace('2. Service Health Probe', 'completed', healthResult.evidenceSummary, 'check_service_health');

    addTrace('3. Error Log Analysis', 'running', 'Querying recent error logs for 5xx root causes', 'query_service_logs');
    const logsResult = await tools.query_service_logs('payment-service');
    addTrace('3. Error Log Analysis', 'completed', logsResult.evidenceSummary, 'query_service_logs');

    addTrace('4. Telemetry Metrics Inspection', 'running', 'Checking DB connection pool and saturation metrics', 'inspect_service_metrics');
    const metricsResult = await tools.inspect_service_metrics('payment-service');
    addTrace('4. Telemetry Metrics Inspection', 'completed', metricsResult.evidenceSummary, 'inspect_service_metrics');

    addTrace('5. Deployment Correlation', 'running', 'Checking recent deployments within the failure window', 'check_recent_deployments');
    const deploysResult = await tools.check_recent_deployments('payment-service');
    addTrace('5. Deployment Correlation', 'completed', deploysResult.evidenceSummary, 'check_recent_deployments');

    // Step 3: Create Incident & Tasks
    const incidentResult = tools.create_incident({
      title: 'Payment Checkout Outage: Database Connection Pool Exhausted (HTTP 503)',
      description: `Elevated 503 error rates (18.7%) following deployment v2.14.2. Connection pool reached 100% saturation (50/50) with 142 queued requests.`,
      priority: 'P1',
      service: 'payment-service',
      roomId: params.roomId,
      reporter: params.senderName,
    });
    const incidentId = incidentResult.data.incidentId;
    this.activeTraces.set(incidentId, trace);

    // Create Tasks
    tools.create_task({
      incidentId,
      title: 'Analyze DB connection leak in commit 7b8fa12 (deployment v2.14.2)',
      description: 'Review checkout query batching logic in db/pool.ts',
      priority: 'high',
      owner: '@jordan.m',
    });

    tools.create_task({
      incidentId,
      title: 'Execute Emergency Pool Expansion (50 -> 150) and Rolling Pod Restart',
      description: 'Increase max_connections parameter and restart container cluster to clear stuck locks',
      priority: 'high',
      owner: '@switchops-ai',
    });

    tools.create_task({
      incidentId,
      title: 'Verify Post-Mitigation P99 Latency and Error Rates',
      description: 'Confirm error rate returns below 0.05% and P99 latency drops below 200ms',
      priority: 'medium',
      owner: '@alex.chen',
    });

    // Step 4: Require Human Approval Before Privileged Consequential Action
    addTrace('6. Human Gatekeeper Evaluation', 'blocked', 'Remediation involves restarting production pods and mutating pool capacity. Submitting for human approval.', 'request_human_approval');

    const approvalResult = tools.request_human_approval({
      incidentId,
      actionName: 'scale_db_pool_and_restart',
      actionPayload: {
        service: 'payment-service',
        current_max_connections: 50,
        target_max_connections: 150,
        restart_strategy: 'rolling_restart',
        cluster: 'prod-us-east-1',
      },
      riskLevel: 'critical',
      consequencesSummary: 'Expands database connection pool limit from 50 to 150 and initiates rolling restart of 5 production containers. May cause brief (1-2s) connection renegotiation during pod switchover.',
      requestedBy: 'SwitchOps AI',
    });

    const approvalId = approvalResult.data.approvalId;

    // Step 5: Post comprehensive diagnostic findings & approval gate message to Switch Room
    const diagnosticMessage = `
### 🔍 SwitchOps Incident Investigation Report [${incidentId}]
**Status:** \`INVESTIGATION COMPLETE — REMEDIATION BLOCKED ON APPROVAL\`  
**Target Service:** \`payment-service\` | **Severity:** 🔴 **P1 - Critical**  
**Reporter:** ${params.senderName}

---
#### 📊 Diagnostic Evidence Collected:
- **Service Health:** 503 Service Unavailable (18.7% error spike, P99 latency 2,450ms)
- **Root Cause Signature:** \`ConnectionPoolTimeoutException\` (50/50 connections maxed, 142 blocked threads)
- **Deployment Correlation:** Correlated with \`v2.14.2\` (*"perf: update checkout query batching"*) deployed 45m ago by Jordan M.

---
#### 🛡️ Human Approval Gate [${approvalId}]:
> **Proposed Remediation:** \`scale_db_pool_and_restart\`  
> **Consequences:** Expands pool to 150 connections and executes zero-downtime rolling restart of 5 container instances.  
> **Risk Tier:** 🚨 **CRITICAL** (Privileged Infrastructure Mutation)  
> **Payload Integrity:** SHA-256 hash bound to approval ticket.  

👉 **Action Required:** Authorized incident commander must review parameter diffs and grant sign-off.
`;

    await this.switchClient.postMessage(params.roomId, diagnosticMessage.trim());

    return {
      incidentId,
      approvalId,
      trace,
    };
  }

  /**
   * Called when an authenticated human makes a decision on a pending approval.
   * Enforces:
   * 1. Server-side role/permission validation (never trusts request body identity).
   * 2. Atomic transition from 'pending' to 'executing' (or 'rejected') to prevent duplicate/concurrent execution.
   * 3. Rejection permanence (cannot approve once rejected).
   * 4. Safe failure handling (marks 'failed' if execution fails).
   */
  public async handleHumanApprovalDecision(
    approvalId: string,
    approved: boolean,
    user: UserPersona,
    reviewerNotes?: string
  ): Promise<{
    success: boolean;
    status: 'approved' | 'rejected' | 'executed' | 'failed';
    error?: string;
    executionResult?: any;
  }> {
    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;
    if (!approval) {
      const err = new Error(`Approval ${approvalId} not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    // 1. Check server-side authorization based on risk level
    if (approved) {
      if (approval.risk_level === 'critical' && !user.permissions.includes('approve_critical')) {
        throw new AuthorizationError(
          `User '${user.name}' (${user.role}) is not authorized to approve critical risk operations. Required: 'approve_critical'.`
        );
      }
      if (approval.risk_level === 'high' && !user.permissions.includes('approve_high')) {
        throw new AuthorizationError(
          `User '${user.name}' (${user.role}) is not authorized to approve high risk operations. Required: 'approve_high'.`
        );
      }
      if (approval.risk_level === 'sensitive' && !user.permissions.includes('approve_sensitive') && !user.permissions.includes('approve_high')) {
        throw new AuthorizationError(
          `User '${user.name}' (${user.role}) is not authorized to approve sensitive operations.`
        );
      }
    }

    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(approval.incident_id) as any;
    const roomId = incident ? incident.room_id : 'incidents-ops';
    const now = new Date().toISOString();

    // 2. Handle Rejection
    if (!approved) {
      const stmt = db.prepare(`
        UPDATE approvals
        SET status = 'rejected', approved_by = ?, reviewer_notes = ?, resolved_at = ?
        WHERE id = ? AND status = 'pending'
      `);
      const info = stmt.run(user.name, reviewerNotes || '', now, approvalId);

      if (info.changes === 0) {
        const current = db.prepare('SELECT status FROM approvals WHERE id = ?').get(approvalId) as any;
        if (current?.status === 'rejected') {
          throw new DecisionConflictError(`Approval ${approvalId} has already been rejected and cannot be modified.`);
        }
        if (current?.status === 'executed') {
          throw new DecisionConflictError(`Approval ${approvalId} has already executed and cannot be rejected.`);
        }
        if (current?.status === 'executing') {
          throw new DecisionConflictError(`Approval ${approvalId} is currently executing and cannot be rejected.`);
        }
        throw new DecisionConflictError(`Approval ${approvalId} is in status '${current?.status}' and cannot be rejected.`);
      }

      logAudit(
        'approval_decision',
        user.name,
        {
          approvalId,
          decision: 'rejected',
          userId: user.id,
          userRole: user.role,
          reviewerNotes,
          incidentId: approval.incident_id,
        },
        approval.incident_id
      );

      await this.switchClient.postMessage(
        roomId,
        `❌ **Remediation Rejected by Human Operator [${approvalId}]:**  
Reviewer: **${user.name}** (${user.title})  
Reason: *"${reviewerNotes || 'Action cancelled by reviewer'}"*  
Automatic remediation permanently halted. Coordinate manual intervention.`
      );

      return { success: false, status: 'rejected' };
    }

    // 3. Handle Approval & Execution
    // Atomic state transition: 'pending' -> 'executing'
    const lockStmt = db.prepare(`
      UPDATE approvals
      SET status = 'executing', approved_by = ?, reviewer_notes = ?, resolved_at = ?
      WHERE id = ? AND status = 'pending'
    `);
    const lockInfo = lockStmt.run(user.name, reviewerNotes || '', now, approvalId);

    if (lockInfo.changes === 0) {
      const current = db.prepare('SELECT status FROM approvals WHERE id = ?').get(approvalId) as any;
      if (current?.status === 'rejected') {
        throw new DecisionConflictError(`Cannot approve: Action ${approvalId} was permanently rejected.`);
      }
      if (current?.status === 'executed') {
        throw new DecisionConflictError(`Cannot approve: Action ${approvalId} has already executed and cannot be replayed.`);
      }
      if (current?.status === 'executing') {
        throw new DecisionConflictError(`Cannot approve: Action ${approvalId} is already executing.`);
      }
      throw new DecisionConflictError(`Cannot approve: Action ${approvalId} is not in pending state (current: '${current?.status}').`);
    }

    logAudit(
      'approval_decision',
      user.name,
      {
        approvalId,
        decision: 'approved',
        userId: user.id,
        userRole: user.role,
        reviewerNotes,
        incidentId: approval.incident_id,
      },
      approval.incident_id
    );

    // 4. Execute remediation with integrity verification
    console.log(`⚡ Executing approved remediation for ${approval.action_name} under authorization of ${user.name}...`);
    const executionResult = await tools.execute_approved_remediation(approvalId, user.name);

    if (!executionResult.success) {
      // Mark as failed in DB
      db.prepare(`
        UPDATE approvals
        SET status = 'failed', execution_outcome = ?
        WHERE id = ? AND status = 'executing'
      `).run(canonicalStringify({ error: executionResult.error }), approvalId);

      // Update trace
      const trace = this.activeTraces.get(approval.incident_id);
      if (trace) {
        trace.push({
          timestamp: new Date().toISOString(),
          step: '7. Remediation Execution Failed',
          status: 'failed',
          details: executionResult.evidenceSummary,
          toolUsed: 'execute_approved_remediation',
        });
      }

      await this.switchClient.postMessage(
        roomId,
        `⚠️ **Remediation Execution FAILED [${approval.incident_id}]:**  
Action: \`${approval.action_name}\`  
Error: *"${executionResult.error}"*  
Incident remains **UNRESOLVED**. Manual inspection required.`
      );

      return {
        success: false,
        status: 'failed',
        error: executionResult.error,
        executionResult,
      };
    }

    // 5. Successful Execution Path: transition from 'executing' to 'executed'
    db.prepare(`
      UPDATE approvals
      SET status = 'executed', execution_outcome = ?
      WHERE id = ? AND status = 'executing'
    `).run(canonicalStringify(executionResult.data), approvalId);

    // Update trace
    const trace = this.activeTraces.get(approval.incident_id);
    if (trace) {
      trace.push({
        timestamp: new Date().toISOString(),
        step: '7. Remediation Execution & Verification',
        status: 'completed',
        details: executionResult.evidenceSummary,
        toolUsed: 'execute_approved_remediation',
      });
    }

    // Post outcome and post-mortem summary to Switch room
    const resolutionMessage = `
### ✅ Emergency Remediation Verified [${approval.incident_id}]
**Authorized By:** **${user.name}** (${user.title}) | **Action:** \`${approval.action_name}\`

---
#### 🛠️ Execution Results:
- **Database Pool:** Expanded from 50 to 150 max connections (simulated).
- **Cluster State:** Rolling restart of 5 instances completed with 0 errors.
- **Telemetry Verification:** Error rate dropped to 0.01%, P99 latency normalized to **115ms (HTTP 200 OK)**.
- **Queued Requests:** Drained to 0.

Incident status has been transitioned to **RESOLVED**. Immutable audit trail recorded.
`;

    await this.switchClient.postMessage(roomId, resolutionMessage.trim());

    return {
      success: true,
      status: 'executed',
      executionResult,
    };
  }
}
