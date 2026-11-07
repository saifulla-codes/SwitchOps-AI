import type {
  DashboardSummary,
  Incident,
  IncidentTask,
  Approval,
  AuditLog,
  SwitchRoom,
  RoomMessage,
  UserPersona,
  AuditVerificationResult,
} from '../types';

const BASE_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof window !== 'undefined' && (window.location.port === '5173' || window.location.port === '3000')
    ? `${window.location.protocol}//${window.location.hostname}:3001/api`
    : '/api');

// Current active persona token, defaults to Alex Chen (Incident Commander)
let currentToken = localStorage.getItem('switchops_token') || 'token-alex-sre-lead';

export function getAuthToken(): string {
  return currentToken;
}

export function setAuthToken(token: string): void {
  currentToken = token;
  try {
    localStorage.setItem('switchops_token', token);
  } catch (e) {
    // Ignore storage issues in private browsing
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Authorization') && currentToken) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.message) {
        errorDetail = data.message;
      } else if (data.error) {
        errorDetail = data.error;
      }
    } catch {
      // Body not JSON
    }
    const err = new Error(errorDetail);
    (err as any).status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  getAuthToken,
  setAuthToken,

  getPersonas: async (): Promise<UserPersona[]> => {
    return request<UserPersona[]>('/auth/personas');
  },

  getCurrentUser: async (): Promise<UserPersona> => {
    return request<UserPersona>('/auth/me');
  },

  getSummary: async (): Promise<DashboardSummary> => {
    return request<DashboardSummary>('/dashboard/summary');
  },

  getIncidents: async (): Promise<Incident[]> => {
    return request<Incident[]>('/incidents');
  },

  getIncidentDetail: async (id: string): Promise<Incident & {
    tasks: IncidentTask[];
    approvals: Approval[];
    audit: AuditLog[];
    trace: any[];
  }> => {
    return request<Incident & {
      tasks: IncidentTask[];
      approvals: Approval[];
      audit: AuditLog[];
      trace: any[];
    }>(`/incidents/${id}`);
  },

  getTasks: async (): Promise<IncidentTask[]> => {
    return request<IncidentTask[]>('/tasks');
  },

  updateTaskStatus: async (taskId: string, status: IncidentTask['status']): Promise<void> => {
    await request(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  getApprovals: async (): Promise<Approval[]> => {
    return request<Approval[]>('/approvals');
  },

  decideApproval: async (
    approvalId: string,
    approved: boolean,
    reviewerNotes?: string
  ): Promise<any> => {
    return request(`/approvals/${approvalId}/decide`, {
      method: 'POST',
      body: JSON.stringify({ approved, reviewerNotes }),
    });
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    return request<AuditLog[]>('/audit-logs');
  },

  verifyAuditChain: async (): Promise<AuditVerificationResult> => {
    return request<AuditVerificationResult>('/audit-logs/verify');
  },

  getSwitchRooms: async (): Promise<SwitchRoom[]> => {
    return request<SwitchRoom[]>('/switch/rooms');
  },

  getRoomMessages: async (roomId: string): Promise<RoomMessage[]> => {
    return request<RoomMessage[]>(`/switch/rooms/${roomId}/messages`);
  },

  postRoomMessage: async (roomId: string, senderName: string, body: string): Promise<any> => {
    return request(`/switch/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderName, body }),
    });
  },

  triggerScenario: async (roomId: string = 'incidents-ops'): Promise<any> => {
    return request('/switch/scenario/trigger', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    });
  },

  resetDemo: async (preserveAudit: boolean = true): Promise<any> => {
    return request('/switch/scenario/reset', {
      method: 'POST',
      body: JSON.stringify({ preserveAudit }),
    });
  },
};
