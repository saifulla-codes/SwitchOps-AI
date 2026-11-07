export interface Incident {
  id: string;
  title: string;
  description: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'investigating' | 'identified' | 'mitigating' | 'resolved';
  service: string;
  room_id: string;
  reporter: string;
  investigation_notes?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  tasksTotal?: number;
  tasksCompleted?: number;
  hasPendingApproval?: boolean;
}

export interface IncidentTask {
  id: string;
  incident_id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in_progress' | 'completed' | 'blocked';
  owner: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
  incident_title?: string;
}

export interface Approval {
  id: string;
  incident_id: string;
  action_name: string;
  action_payload: Record<string, any>;
  payload_hash?: string;
  risk_level: 'critical' | 'high' | 'sensitive';
  consequences_summary: string;
  status: 'pending' | 'executing' | 'approved' | 'rejected' | 'executed' | 'failed';
  requested_by: string;
  approved_by?: string;
  reviewer_notes?: string;
  execution_outcome?: any;
  created_at: string;
  resolved_at?: string;
  incident_title?: string;
  incident_service?: string;
}

export interface AuditLog {
  id: string;
  incident_id?: string;
  event_type: string;
  actor: string;
  details: Record<string, any>;
  timestamp: string;
  prev_hash?: string;
  entry_hash?: string;
}

export type UserRole = 'incident_commander' | 'operator' | 'engineer' | 'viewer';

export interface UserPersona {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  token: string;
  permissions: string[];
}

export interface AuditVerificationResult {
  verified: boolean;
  totalRecords: number;
  headHash: string | null;
  brokenAt?: {
    id: string;
    eventType: string;
    timestamp: string;
    reason: string;
    expectedHash: string;
    actualHash: string;
  };
}

export interface SwitchStatus {
  connected: boolean;
  simulated: boolean;
  connectionId: string;
  agentId: string;
  bridgeUrl: string;
  rooms: string[];
  cursor: number;
  generation?: string;
}

export interface DashboardSummary {
  incidents: {
    total: number;
    active: number;
    resolved: number;
  };
  approvals: {
    pending: number;
    total: number;
  };
  tasks: {
    total: number;
    completed: number;
    active: number;
  };
  switchStatus: SwitchStatus;
  recentLogs: AuditLog[];
}

export interface SwitchRoom {
  room_id: string;
  name: string;
  channel_name: string;
  platform: string;
  instructions?: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    type: 'user' | 'agent' | 'admin';
  }>;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  sender: string;
  senderName: string;
  body: string;
  timestamp: number;
  isAgent: boolean;
  addressed?: boolean;
}

export interface AgentStepTrace {
  timestamp: string;
  step: string;
  status: 'running' | 'completed' | 'blocked' | 'failed';
  details: string;
  toolUsed?: string;
}
