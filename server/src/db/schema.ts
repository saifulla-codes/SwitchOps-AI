import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dbPath = process.env.SQLITE_DB_PATH || './data/switchops.db';
const resolvedDir = path.dirname(dbPath);
if (!fs.existsSync(resolvedDir)) {
  fs.mkdirSync(resolvedDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

// Enable WAL mode and busy timeout for concurrent safety
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    service TEXT NOT NULL,
    room_id TEXT NOT NULL,
    reporter TEXT NOT NULL,
    investigation_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS incident_tasks (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    owner TEXT NOT NULL,
    deadline TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    action_name TEXT NOT NULL,
    action_payload TEXT NOT NULL,
    payload_hash TEXT,
    risk_level TEXT NOT NULL,
    consequences_summary TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    reviewer_notes TEXT,
    execution_outcome TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    incident_id TEXT,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    prev_hash TEXT,
    entry_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS switch_events (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    body TEXT NOT NULL,
    addressed INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Safe migrations for existing databases
try {
  db.exec(`ALTER TABLE approvals ADD COLUMN payload_hash TEXT;`);
} catch {}
try {
  db.exec(`ALTER TABLE approvals ADD COLUMN execution_outcome TEXT;`);
} catch {}
try {
  db.exec(`ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT;`);
} catch {}
try {
  db.exec(`ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT;`);
} catch {}

/**
 * Deterministic JSON stringification with sorted keys
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

export function calculateSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export const GENESIS_HASH = 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Log an audit entry with SHA-256 tamper-evident hash chaining
 */
export function logAudit(
  eventType: string,
  actor: string,
  details: Record<string, any>,
  incidentId?: string
): string {
  const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  const canonicalDetails = canonicalStringify(details);

  // Retrieve previous entry's hash
  const lastEntry = db
    .prepare('SELECT entry_hash FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1')
    .get() as { entry_hash?: string } | undefined;

  const prevHash = lastEntry?.entry_hash || GENESIS_HASH;

  // Compute entry hash binding previous hash, id, incidentId, eventType, actor, details, and timestamp
  const hashPayload = `${prevHash}|${id}|${incidentId || ''}|${eventType}|${actor}|${canonicalDetails}|${timestamp}`;
  const entryHash = calculateSha256(hashPayload);

  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, incident_id, event_type, actor, details, timestamp, prev_hash, entry_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, incidentId || null, eventType, actor, canonicalDetails, timestamp, prevHash, entryHash);
  return id;
}

/**
 * Verifies the integrity of the audit log hash chain from oldest to newest
 */
export function verifyAuditChain(): {
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
} {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY rowid ASC').all() as any[];

  if (logs.length === 0) {
    return {
      verified: true,
      totalRecords: 0,
      headHash: null,
    };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < logs.length; i++) {
    const row = logs[i];

    // If historical rows prior to migration don't have entry_hash, skip chain check for them
    if (!row.entry_hash) {
      continue;
    }

    if (row.prev_hash !== expectedPrevHash) {
      return {
        verified: false,
        totalRecords: logs.length,
        headHash: null,
        brokenAt: {
          id: row.id,
          eventType: row.event_type,
          timestamp: row.timestamp,
          reason: 'prev_hash mismatch in audit chain',
          expectedHash: expectedPrevHash,
          actualHash: row.prev_hash || 'null',
        },
      };
    }

    // Recompute entry hash
    let parsedDetails: any;
    try {
      parsedDetails = JSON.parse(row.details);
    } catch {
      parsedDetails = row.details;
    }
    const canonicalDetails = canonicalStringify(parsedDetails);
    const hashPayload = `${row.prev_hash}|${row.id}|${row.incident_id || ''}|${row.event_type}|${row.actor}|${canonicalDetails}|${row.timestamp}`;
    const calculatedHash = calculateSha256(hashPayload);

    if (calculatedHash !== row.entry_hash) {
      return {
        verified: false,
        totalRecords: logs.length,
        headHash: null,
        brokenAt: {
          id: row.id,
          eventType: row.event_type,
          timestamp: row.timestamp,
          reason: 'entry_hash signature mismatch (log content was tampered with)',
          expectedHash: calculatedHash,
          actualHash: row.entry_hash,
        },
      };
    }

    expectedPrevHash = row.entry_hash;
  }

  return {
    verified: true,
    totalRecords: logs.length,
    headHash: expectedPrevHash,
  };
}
