import { db, logAudit, canonicalStringify, calculateSha256 } from '../db/schema.js';

export interface ToolResult<T = any> {
  success: boolean;
  tool: string;
  data: T;
  error?: string;
  evidenceSummary: string;
}

export class OperationsToolRegistry {
  /**
   * Diagnostic: Check service health and availability
   */
  public async check_service_health(serviceName: string): Promise<ToolResult> {
    const isPaymentService = serviceName.toLowerCase().includes('payment') || serviceName.toLowerCase().includes('checkout');

    if (isPaymentService) {
      const data = {
        service: serviceName,
        status: 'degraded',
        http_status: 503,
        error_rate: '18.7%',
        p99_latency_ms: 2450,
        healthy_instances: '3/5',
        last_heartbeat: new Date().toISOString(),
        critical_alerts: ['High5xxRateTriggered', 'ConnectionPoolNearExhaustion'],
      };
      return {
        success: true,
        tool: 'check_service_health',
        data,
        evidenceSummary: `Service ${serviceName} is DEGRADED. 5xx error rate at 18.7%, P99 latency spiked to 2,450ms. 2 of 5 instances unresponsive.`,
      };
    }

    const data = {
      service: serviceName,
      status: 'healthy',
      http_status: 200,
      error_rate: '0.02%',
      p99_latency_ms: 120,
      healthy_instances: '4/4',
      last_heartbeat: new Date().toISOString(),
      critical_alerts: [],
    };
    return {
      success: true,
      tool: 'check_service_health',
      data,
      evidenceSummary: `Service ${serviceName} is HEALTHY. Error rate 0.02%, P99 latency 120ms.`,
    };
  }

  /**
   * Diagnostic: Query service logs for errors and stack traces
   */
  public async query_service_logs(serviceName: string, query?: string): Promise<ToolResult> {
    const isPayment = serviceName.toLowerCase().includes('payment') || serviceName.toLowerCase().includes('checkout');
    
    if (isPayment) {
      const logEntries = [
        {
          timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
          level: 'ERROR',
          message: 'ConnectionPoolTimeoutException: Timeout waiting for connection from pool (max=50, active=50, pending=142)',
          context: { file: 'db/pool.ts', line: 128 },
        },
        {
          timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
          level: 'ERROR',
          message: 'HTTP 503 Service Unavailable: Transaction checkout endpoint failed to commit within 15000ms',
          context: { endpoint: 'POST /v1/checkout/process', client_ip: '10.0.4.12' },
        },
        {
          timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
          level: 'WARN',
          message: 'DB health check slow response: 4890ms',
          context: { target: 'aurora-pg-primary' },
        },
      ];

      return {
        success: true,
        tool: 'query_service_logs',
        data: { service: serviceName, totalErrors: 842, logEntries },
        evidenceSummary: `Identified 842 error events in ${serviceName}. Root cause signature: ConnectionPoolTimeoutException (pool limit 50 exhausted with 142 queued requests).`,
      };
    }

    return {
      success: true,
      tool: 'query_service_logs',
      data: { service: serviceName, totalErrors: 0, logEntries: [] },
      evidenceSummary: `No significant error events found for ${serviceName}.`,
    };
  }

  /**
   * Diagnostic: Inspect metrics (CPU, Memory, DB pools)
   */
  public async inspect_service_metrics(serviceName: string): Promise<ToolResult> {
    const metrics = {
      service: serviceName,
      cpu_utilization: '44%',
      memory_utilization: '68%',
      db_connection_pool: {
        max_configured: 50,
        active_connections: 50,
        idle_connections: 0,
        waiting_requests: 142,
        saturation_pct: '100%',
      },
      upstream_payment_gateway_latency_ms: 185,
    };

    return {
      success: true,
      tool: 'inspect_service_metrics',
      data: metrics,
      evidenceSummary: `Metrics confirm DB connection pool is 100% saturated (50/50 connections occupied, 142 pending requests blocked).`,
    };
  }

  /**
   * Diagnostic: Check recent releases and deployments
   */
  public async check_recent_deployments(serviceName: string): Promise<ToolResult> {
    const deployments = [
      {
        version: 'v2.14.2',
        deployed_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        author: 'jordan.m@corp',
        commit: '7b8fa12',
        message: 'perf: update checkout query batching and connection acquire logic',
        status: 'active',
      },
      {
        version: 'v2.14.1',
        deployed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        author: 'sarah.k@corp',
        commit: '3a14e9c',
        message: 'fix: optimize receipt generation pipeline',
        status: 'superseded',
      },
    ];

    return {
      success: true,
      tool: 'check_recent_deployments',
      data: { service: serviceName, deployments },
      evidenceSummary: `Recent deployment detected: v2.14.2 deployed 45 minutes ago by jordan.m. Commit 7b8fa12 modified connection acquire logic, correlating with the failure window.`,
    };
  }

  /**
   * Orchestration: Create an Incident Record
   */
  public create_incident(params: {
    title: string;
    description: string;
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    service: string;
    roomId: string;
    reporter: string;
  }): ToolResult {
    const id = `INC-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO incidents (id, title, description, priority, status, service, room_id, reporter, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, params.title, params.description, params.priority, 'investigating', params.service, params.roomId, params.reporter, now, now);

    logAudit('incident_created', 'switchops-ai', { incidentId: id, ...params }, id);

    return {
      success: true,
      tool: 'create_incident',
      data: { incidentId: id, status: 'investigating' },
      evidenceSummary: `Created Incident [${id}] - Priority ${params.priority}: "${params.title}" in room ${params.roomId}.`,
    };
  }

  /**
   * Orchestration: Create a Task
   */
  public create_task(params: {
    incidentId: string;
    title: string;
    description?: string;
    priority: 'high' | 'medium' | 'low';
    owner: string;
    deadline?: string;
  }): ToolResult {
    const id = `TASK-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 5)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO incident_tasks (id, incident_id, title, description, priority, status, owner, deadline, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.incidentId,
      params.title,
      params.description || '',
      params.priority,
      'todo',
      params.owner,
      params.deadline || null,
      now,
      now
    );

    logAudit('task_created', 'switchops-ai', { taskId: id, ...params }, params.incidentId);

    return {
      success: true,
      tool: 'create_task',
      data: { taskId: id, ...params },
      evidenceSummary: `Added task [${id}]: "${params.title}" assigned to ${params.owner}.`,
    };
  }

  /**
   * Security / Human-in-the-Loop: Request human approval for privileged or consequential actions
   * Computes deterministic SHA-256 canonical hash of payload to guarantee parameter integrity.
   */
  public request_human_approval(params: {
    incidentId: string;
    actionName: string;
    actionPayload: Record<string, any>;
    riskLevel: 'critical' | 'high' | 'sensitive';
    consequencesSummary: string;
    requestedBy?: string;
  }): ToolResult {
    const id = `APPR-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const canonicalPayload = canonicalStringify(params.actionPayload);
    const payloadHash = calculateSha256(canonicalPayload);

    const stmt = db.prepare(`
      INSERT INTO approvals (id, incident_id, action_name, action_payload, payload_hash, risk_level, consequences_summary, status, requested_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      id,
      params.incidentId,
      params.actionName,
      canonicalPayload,
      payloadHash,
      params.riskLevel,
      params.consequencesSummary,
      params.requestedBy || 'SwitchOps AI',
      now
    );

    logAudit(
      'approval_requested',
      'switchops-ai',
      {
        approvalId: id,
        incidentId: params.incidentId,
        actionName: params.actionName,
        payloadHash,
        riskLevel: params.riskLevel,
        consequencesSummary: params.consequencesSummary,
      },
      params.incidentId
    );

    return {
      success: true,
      tool: 'request_human_approval',
      data: {
        approvalId: id,
        status: 'pending',
        action: params.actionName,
        payloadHash,
        consequences: params.consequencesSummary,
      },
      evidenceSummary: `ACTION SUSPENDED: Privileged action "${params.actionName}" requires human authorization. Approval ticket ${id} created (Payload SHA-256: ${payloadHash.substring(0, 12)}...).`,
    };
  }

  /**
   * Remediation: Executes an action ONLY if approved by a human.
   * Enforces:
   * 1. State machine check ('executing' or 'approved')
   * 2. Canonical payload SHA-256 integrity verification
   * 3. Incident existence check
   * 4. Safe partial failure handling (does NOT mark incident resolved or tasks completed on failure)
   */
  public async execute_approved_remediation(approvalId: string, actor: string = 'system'): Promise<ToolResult> {
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;

    if (!row) {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `Approval record ${approvalId} not found`,
        evidenceSummary: `Failed execution: Approval ${approvalId} not found.`,
      };
    }

    // 1. State machine check
    if (row.status === 'pending') {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `SECURITY REFUSAL: Action is currently 'pending'. Consequential operations are strictly prohibited without human sign-off.`,
        evidenceSummary: `BLOCKED: Cannot execute ${row.action_name}. Status is still pending.`,
      };
    }

    if (row.status === 'rejected') {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `SECURITY REFUSAL: Action is permanently 'rejected'. Execution of rejected operations is forbidden.`,
        evidenceSummary: `BLOCKED: Cannot execute ${row.action_name}. Status is rejected.`,
      };
    }

    if (row.status === 'executed') {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `SECURITY REFUSAL: Action has already been 'executed'. Replay execution is forbidden.`,
        evidenceSummary: `BLOCKED: Cannot execute ${row.action_name}. Already executed.`,
      };
    }

    if (row.status !== 'executing' && row.status !== 'approved') {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `SECURITY REFUSAL: Action has invalid status '${row.status}'.`,
        evidenceSummary: `BLOCKED: Cannot execute ${row.action_name}. Invalid status '${row.status}'.`,
      };
    }

    // 2. Incident existence check
    const incident = db.prepare('SELECT id, status FROM incidents WHERE id = ?').get(row.incident_id) as any;
    if (!incident) {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `TARGET_INCIDENT_NOT_FOUND: Bound incident ${row.incident_id} does not exist.`,
        evidenceSummary: `BLOCKED: Incident ${row.incident_id} not found.`,
      };
    }

    // 3. Payload cryptographic hash integrity verification
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(row.action_payload);
    } catch {
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `INTEGRITY_VIOLATION: Action payload is not valid JSON.`,
        evidenceSummary: `BLOCKED: Corrupted payload JSON.`,
      };
    }

    if (row.payload_hash) {
      const canonical = canonicalStringify(parsedPayload);
      const computedHash = calculateSha256(canonical);
      if (computedHash !== row.payload_hash) {
        logAudit(
          'security_integrity_violation',
          actor,
          {
            approvalId,
            reason: 'payload_hash mismatch',
            expected: row.payload_hash,
            computed: computedHash,
          },
          row.incident_id
        );
        return {
          success: false,
          tool: 'execute_approved_remediation',
          data: null,
          error: `INTEGRITY_VIOLATION: Cryptographic payload hash mismatch. Action payload does not match canonical hash. Payload was tampered with.`,
          evidenceSummary: `BLOCKED: Payload hash mismatch detected.`,
        };
      }
    }

    // 4. Execute remediation safely
    let outcomeDetails: any = {};
    try {
      switch (row.action_name) {
        case 'scale_db_pool_and_restart': {
          outcomeDetails = {
            action: 'scale_db_pool_and_restart',
            previous_pool_size: 50,
            new_pool_size: 150,
            rolling_restart: 'completed',
            instances_refreshed: 5,
            active_connections_post_restart: 18,
            waiting_requests: 0,
            p99_latency_ms: 115,
            http_status: 200,
            simulated: true,
          };
          break;
        }
        case 'rollback_deployment': {
          outcomeDetails = {
            action: 'rollback_deployment',
            rolled_back_from: 'v2.14.2',
            target_version: 'v2.14.1',
            containers_updated: 5,
            traffic_restored: '100%',
            simulated: true,
          };
          break;
        }
        case 'flush_redis_cache_cluster': {
          outcomeDetails = {
            action: 'flush_redis_cache_cluster',
            cluster: 'redis-auth-prod',
            keys_flushed: 14200,
            latency_normalized_ms: 12,
            simulated: true,
          };
          break;
        }
        default: {
          return {
            success: false,
            tool: 'execute_approved_remediation',
            data: null,
            error: `UNKNOWN_ACTION: Action '${row.action_name}' is not in the authorized tool registry.`,
            evidenceSummary: `BLOCKED: Unknown action ${row.action_name}.`,
          };
        }
      }
    } catch (err: any) {
      logAudit(
        'remediation_failed',
        actor,
        { approvalId, action: row.action_name, error: err.message },
        row.incident_id
      );
      return {
        success: false,
        tool: 'execute_approved_remediation',
        data: null,
        error: `Remediation execution failed: ${err.message}`,
        evidenceSummary: `Failed execution: ${err.message}. Incident remains unresolved.`,
      };
    }

    // 5. Success path: update incident and tasks ONLY after successful operation
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE incidents
      SET status = 'resolved', resolved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, row.incident_id);

    db.prepare(`
      UPDATE incident_tasks
      SET status = 'completed', updated_at = ?
      WHERE incident_id = ? AND status != 'completed'
    `).run(now, row.incident_id);

    logAudit(
      'remediation_executed',
      actor,
      { approvalId, action: row.action_name, outcome: outcomeDetails },
      row.incident_id
    );

    return {
      success: true,
      tool: 'execute_approved_remediation',
      data: outcomeDetails,
      evidenceSummary: `Successfully executed approved remediation "${row.action_name}". Connection pool expanded to 150, rolling restart completed. Service latency normalized to 115ms (HTTP 200). Incident marked RESOLVED.`,
    };
  }
}

export const tools = new OperationsToolRegistry();
