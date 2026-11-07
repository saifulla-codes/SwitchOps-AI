import { EventEmitter } from 'node:events';
import { db } from '../db/schema.js';
import type { SwitchRoomContext } from './types.js';

export interface RoomChatMessage {
  id: string;
  roomId: string;
  sender: string;
  senderName: string;
  body: string;
  timestamp: number;
  isAgent: boolean;
  addressed: boolean;
}

export const PRESET_ROOMS: SwitchRoomContext[] = [
  {
    room_id: 'incidents-ops',
    name: 'P1 Incident Command',
    channel_name: '#incidents-ops',
    platform: 'mattermost',
    instructions: 'Active production incident command room. Triage anomalies, coordinate remediation, enforce approval gate.',
    participants: [
      { id: '@alex.chen:corp', name: 'Alex Chen (Site Reliability Lead)', role: 'Incident Commander', type: 'user' },
      { id: '@sarah.k:corp', name: 'Sarah Kumar (Backend Platform)', role: 'Primary On-Call', type: 'user' },
      { id: '@switchops-ai:switchops', name: 'SwitchOps AI', role: 'Operations Teammate', type: 'agent' },
    ],
  },
  {
    room_id: 'checkout-team',
    name: 'Payments & Checkout Service',
    channel_name: '#checkout-team',
    platform: 'slack',
    instructions: 'Checkout and billing service team room. Monitored for payment processor latency and checkout failures.',
    participants: [
      { id: '@jordan.m:corp', name: 'Jordan Miller (Payments Eng)', role: 'Payments Lead', type: 'user' },
      { id: '@switchops-ai:switchops', name: 'SwitchOps AI', role: 'Operations Teammate', type: 'agent' },
    ],
  },
];

export class SwitchSimulatorAdapter extends EventEmitter {
  private rooms: Map<string, SwitchRoomContext> = new Map();
  private messages: RoomChatMessage[] = [];

  constructor() {
    super();
    PRESET_ROOMS.forEach((r) => this.rooms.set(r.room_id, r));
  }

  public getRooms(): SwitchRoomContext[] {
    return Array.from(this.rooms.values());
  }

  public getMessages(roomId: string): RoomChatMessage[] {
    // Read from DB and memory
    const rows = db.prepare(`
      SELECT id, room_id as roomId, sender, sender_name as senderName, body, addressed, created_at
      FROM switch_events
      WHERE room_id = ?
      ORDER BY rowid ASC
    `).all(roomId) as any[];

    return rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      sender: r.sender,
      senderName: r.senderName,
      body: r.body,
      timestamp: new Date(r.created_at).getTime(),
      isAgent: r.sender.includes('switchops-ai') || r.senderName.includes('SwitchOps'),
      addressed: Boolean(r.addressed),
    }));
  }

  public simulateInboundMessage(roomId: string, senderName: string, text: string): RoomChatMessage {
    const isAddressed = text.includes('@switchops') || text.includes('SwitchOps') || text.toLowerCase().includes('switchops');
    const sender = `@${senderName.toLowerCase().replace(/\s+/g, '.')}:corp`;

    const stmt = db.prepare(`
      INSERT INTO switch_events (id, room_id, sequence, event_type, sender, sender_name, body, addressed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const eventId = `sim-evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    stmt.run(
      eventId,
      roomId,
      Date.now(),
      'message',
      sender,
      senderName,
      text,
      isAddressed ? 1 : 0,
      new Date().toISOString()
    );

    const msg: RoomChatMessage = {
      id: eventId,
      roomId,
      sender,
      senderName,
      body: text,
      timestamp: Date.now(),
      isAgent: false,
      addressed: isAddressed,
    };

    this.messages.push(msg);

    // Emit event so AI agent catches it
    this.emit('message', {
      roomId,
      sender,
      senderName,
      text,
      messageId: eventId,
      addressed: isAddressed,
    });

    return msg;
  }
}
