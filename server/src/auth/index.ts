import type { Request, Response, NextFunction } from 'express';

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

export const LOCAL_PERSONAS: Record<string, UserPersona> = {
  'token-alex-sre-lead': {
    id: 'usr-alex-chen',
    name: 'Alex Chen',
    email: 'alex.chen@switchops.local',
    role: 'incident_commander',
    title: 'Site Reliability Lead',
    token: 'token-alex-sre-lead',
    permissions: [
      'read',
      'post_message',
      'create_task',
      'update_task',
      'approve_critical',
      'approve_high',
      'approve_sensitive',
      'execute_remediation',
      'admin_reset',
    ],
  },
  'token-sarah-platform': {
    id: 'usr-sarah-kumar',
    name: 'Sarah Kumar',
    email: 'sarah.k@switchops.local',
    role: 'operator',
    title: 'Platform Engineer',
    token: 'token-sarah-platform',
    permissions: [
      'read',
      'post_message',
      'create_task',
      'update_task',
      'approve_high',
      'approve_sensitive',
      // Note: lacks 'approve_critical' and 'admin_reset'
    ],
  },
  'token-jordan-payments': {
    id: 'usr-jordan-miller',
    name: 'Jordan Miller',
    email: 'jordan.m@switchops.local',
    role: 'engineer',
    title: 'Payments Lead',
    token: 'token-jordan-payments',
    permissions: [
      'read',
      'post_message',
      'create_task',
      'update_task',
      // Note: lacks any approval permissions
    ],
  },
  'token-guest-viewer': {
    id: 'usr-guest-viewer',
    name: 'Guest Observer',
    email: 'guest@switchops.local',
    role: 'viewer',
    title: 'Read-Only Auditor',
    token: 'token-guest-viewer',
    permissions: ['read'],
  },
};

export interface AuthenticatedRequest extends Request {
  user?: UserPersona;
}

export function authenticateToken(token: string | undefined): UserPersona | null {
  if (!token) return null;

  // 1. Check local development personas
  if (LOCAL_PERSONAS[token]) {
    return LOCAL_PERSONAS[token];
  }

  // 2. Check configurable admin token from environment
  const customAdminToken = process.env.SWITCHOPS_ADMIN_TOKEN;
  if (customAdminToken && token === customAdminToken) {
    return {
      id: 'usr-admin-custom',
      name: 'System Administrator',
      email: 'admin@switchops.local',
      role: 'incident_commander',
      title: 'Configured System Admin',
      token: customAdminToken,
      permissions: [
        'read',
        'post_message',
        'create_task',
        'update_task',
        'approve_critical',
        'approve_high',
        'approve_sensitive',
        'execute_remediation',
        'admin_reset',
      ],
    };
  }

  return null;
}

export function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const customHeader = req.headers['x-switchops-token'];
  if (typeof customHeader === 'string') {
    return customHeader.trim();
  }
  return undefined;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const user = authenticateToken(token);

  if (!user) {
    res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication required. Please provide a valid Bearer token in the Authorization header.',
    });
    return;
  }

  req.user = user;
  next();
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
      return;
    }

    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `User '${req.user.name}' (${req.user.role}) lacks required permission '${permission}'.`,
      });
      return;
    }

    next();
  };
}
