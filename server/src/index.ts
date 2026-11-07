import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { db, logAudit, calculateSha256, canonicalStringify } from './db/schema.js';
import { SwitchAgentClient } from './switch/client.js';
import { SwitchSimulatorAdapter } from './switch/adapter.js';
import { OperationsAgentEngine } from './agent/engine.js';
import { createApiRouter } from './routes/api.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Switch Client
const switchConfig = {
  bridgeUrl: process.env.SWITCH_BRIDGE_URL || undefined,
  agentId: process.env.SWITCH_AGENT_ID || 'switchops-ai',
  apiKey: process.env.SWITCH_API_KEY || undefined,
  rooms: (process.env.SWITCH_ROOM_IDS || 'incidents-ops,checkout-team').split(','),
};

const switchClient = new SwitchAgentClient(switchConfig);
const simulator = new SwitchSimulatorAdapter();
const agentEngine = new OperationsAgentEngine(switchClient);

// Forward addressed messages from Switch Client to Agent Engine
switchClient.on('message', async (event) => {
  try {
    await agentEngine.processInboundMessage({
      roomId: event.roomId,
      sender: event.sender,
      senderName: event.senderName,
      text: event.text,
      messageId: event.messageId,
    });
  } catch (err) {
    console.error('Error in agent processing inbound message:', err);
  }
});

// Forward addressed messages from Simulator Adapter to Agent Engine
simulator.on('message', async (event) => {
  if (event.addressed) {
    try {
      await agentEngine.processInboundMessage({
        roomId: event.roomId,
        sender: event.sender,
        senderName: event.senderName,
        text: event.text,
        messageId: event.messageId,
      });
    } catch (err) {
      console.error('Error in agent processing simulated message:', err);
    }
  }
});

// Also mirror agent outgoing messages to simulator so dashboard chat shows both sides
switchClient.on('room_message_broadcast', (msg) => {
  // stored already in DB by switchClient.postMessage
});

// Seed default initial state if empty
function seedInitialData() {
  const count = db.prepare('SELECT count(*) as count FROM incidents').get() as any;
  if (count.count === 0) {
    console.log('🌱 Seeding initial demo workflow scenario...');
    logAudit('system_startup', 'system', { mode: process.env.APP_MODE || 'demo', version: '1.0.0' });

    // Seed initial historical incident
    const incId = 'INC-1042';
    const now = new Date(Date.now() - 1000 * 60 * 120).toISOString();
    const resolvedTime = new Date(Date.now() - 1000 * 60 * 30).toISOString();

    db.prepare(`
      INSERT INTO incidents (id, title, description, priority, status, service, room_id, reporter, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      incId,
      'Auth Service Token Validation Latency Spike',
      'Intermittent Redis timeout causing token validation delays across microservices.',
      'P2',
      'resolved',
      'auth-service',
      'incidents-ops',
      'Sarah Kumar',
      now,
      resolvedTime,
      resolvedTime
    );

    db.prepare(`
      INSERT INTO incident_tasks (id, incident_id, title, description, priority, status, owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TASK-1042-1',
      incId,
      'Flush stale Redis token cache keys and scale cluster nodes',
      'Automated cache flush executed after human approval',
      'high',
      'completed',
      '@switchops-ai',
      now,
      resolvedTime
    );

    const seedPayload = { cluster: 'redis-auth-prod', target: 'keyspace-tokens' };
    const seedPayloadHash = calculateSha256(canonicalStringify(seedPayload));

    db.prepare(`
      INSERT INTO approvals (id, incident_id, action_name, action_payload, payload_hash, risk_level, consequences_summary, status, requested_by, approved_by, reviewer_notes, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'APPR-1042',
      incId,
      'flush_redis_cache_cluster',
      JSON.stringify(seedPayload),
      seedPayloadHash,
      'high',
      'Invalidates active session token cache, forcing re-authentication from DB replica for 60 seconds.',
      'executed',
      'SwitchOps AI',
      'Alex Chen',
      'Approved after verifying DB replica has sufficient headroom.',
      now,
      new Date(Date.now() - 1000 * 60 * 50).toISOString()
    );

    // Initial Switch room message
    db.prepare(`
      INSERT INTO switch_events (id, room_id, sequence, event_type, sender, sender_name, body, addressed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-seed-1',
      'incidents-ops',
      1,
      'message',
      '@system:switchops',
      'Switch Bot',
      'Room created: #incidents-ops for incident command and operations coordination.',
      0,
      now
    );
  }
}

seedInitialData();

// Mount API routes
app.use('/api', createApiRouter(switchClient, simulator, agentEngine));

// Start backend
app.listen(PORT, () => {
  console.log(`🚀 SwitchOps AI backend running on http://localhost:${PORT}`);
  switchClient.connect();
});
