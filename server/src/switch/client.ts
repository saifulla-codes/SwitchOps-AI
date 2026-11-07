import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { db, logAudit } from '../db/schema.js';
import type {
  SwitchDomainEvent,
  SwitchConnectionStateFrame,
  SwitchPingFrame,
  SwitchPongFrame,
} from './types.js';

export interface SwitchClientConfig {
  bridgeUrl?: string;
  agentId: string;
  apiKey?: string;
  rooms: string[];
}

export class SwitchAgentClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: SwitchClientConfig;
  private connectionId: string;
  private cursor = 0;
  private generation: string | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isSimulatedMode = false;

  constructor(config: SwitchClientConfig) {
    super();
    this.config = config;
    this.connectionId = `conn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.isSimulatedMode = !config.bridgeUrl || !config.apiKey;
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      simulated: this.isSimulatedMode,
      connectionId: this.connectionId,
      agentId: this.config.agentId,
      bridgeUrl: this.config.bridgeUrl || 'None (Local Test Adapter Active)',
      rooms: this.config.rooms,
      cursor: this.cursor,
      generation: this.generation,
    };
  }

  public connect() {
    if (this.isSimulatedMode) {
      console.log('ℹ️  SwitchOps AI running in Local Test Adapter mode (no external bridge URL configured).');
      this.isConnected = true;
      this.emit('connected', { mode: 'simulated', rooms: this.config.rooms });
      return;
    }

    const { bridgeUrl, agentId, apiKey, rooms } = this.config;
    const wsUrl = new URL(`/agents/${agentId}/connection/ws`, bridgeUrl);
    wsUrl.searchParams.set('connection_id', this.connectionId);
    wsUrl.searchParams.set('rooms', rooms.join(','));
    wsUrl.searchParams.set('filter', 'addressed');
    if (this.cursor > 0) {
      wsUrl.searchParams.set('start_from', String(this.cursor));
    }
    if (this.generation) {
      wsUrl.searchParams.set('expected_generation', this.generation);
    }

    console.log(`🔌 Connecting to Switch Bridge at ${wsUrl.toString()}...`);

    try {
      this.ws = new WebSocket(wsUrl.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      this.ws.on('open', () => {
        console.log('✅ Switch WebSocket connected.');
        this.isConnected = true;
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const raw = JSON.parse(data.toString());
          this.handleFrame(raw);
        } catch (err) {
          console.error('Failed to parse Switch frame:', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`⚠️ Switch connection closed (${code}): ${reason.toString()}`);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('❌ Switch WebSocket error:', err.message);
        this.isConnected = false;
      });
    } catch (err: any) {
      console.error('Failed to initialize Switch WebSocket client:', err.message);
      this.scheduleReconnect();
    }
  }

  private handleFrame(frame: any) {
    // 1. Ping frame -> reply with pong immediately
    if (frame.type === 'ping') {
      const pong: SwitchPongFrame = {
        type: 'pong',
        cursor: this.cursor,
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(pong));
      }
      return;
    }

    // 2. Connection state frame
    if (frame.type === 'connection_state') {
      const state = frame as SwitchConnectionStateFrame;
      this.generation = state.generation;
      this.cursor = state.cursor;
      console.log(`📡 Switch connection established. Generation: ${state.generation}, Rooms: [${state.rooms.join(', ')}]`);
      this.emit('connected', state);
      return;
    }

    // 3. Evicted or Refused
    if (frame.type === 'evicted') {
      console.warn(`🛑 Switch evicted frame received: ${frame.code} - ${frame.reason}`);
      if (frame.code === 'taken_over') {
        console.error('Connection taken over by sibling client; halting reconnect.');
        return;
      }
      return;
    }

    // 4. Domain event (e.g. message)
    if (frame.event === 'message' && frame.data) {
      const domainEvent = frame as SwitchDomainEvent;
      this.cursor = domainEvent.id;

      // Log Switch event to DB
      const stmt = db.prepare(`
        INSERT INTO switch_events (id, room_id, sequence, event_type, sender, sender_name, body, addressed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        domainEvent.data.room_id,
        domainEvent.data.sequence,
        domainEvent.data.type,
        domainEvent.data.payload.sender,
        domainEvent.data.payload.sender_name,
        domainEvent.data.payload.body,
        domainEvent.data.payload.addressed ? 1 : 0,
        new Date().toISOString()
      );

      if (domainEvent.data.payload.addressed) {
        console.log(`💬 Inbound addressed message from ${domainEvent.data.payload.sender_name}: "${domainEvent.data.payload.body}"`);
        this.emit('message', {
          roomId: domainEvent.data.room_id,
          sender: domainEvent.data.payload.sender,
          senderName: domainEvent.data.payload.sender_name,
          text: domainEvent.data.payload.body,
          messageId: domainEvent.data.payload.message_id,
          threadId: domainEvent.data.payload.thread_id,
        });
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('🔄 Attempting Switch Bridge reconnect...');
      this.connect();
    }, 5000);
  }

  /**
   * Post message back to the Switch room
   */
  public async postMessage(roomId: string, content: string): Promise<boolean> {
    // Record in database and audit
    logAudit('switch_post_message', 'switchops-ai', { roomId, contentLength: content.length, preview: content.slice(0, 100) });

    const stmt = db.prepare(`
      INSERT INTO switch_events (id, room_id, sequence, event_type, sender, sender_name, body, addressed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      roomId,
      ++this.cursor,
      'message',
      `@${this.config.agentId}:switchops`,
      'SwitchOps AI',
      content,
      0,
      new Date().toISOString()
    );

    // If real bridge is configured, invoke Switch REST API
    if (!this.isSimulatedMode && this.config.bridgeUrl && this.config.apiKey) {
      try {
        const url = `${this.config.bridgeUrl}/agents/${this.config.agentId}/message`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'X-Switch-Connection-Id': this.connectionId,
          },
          body: JSON.stringify({ room_id: roomId, content }),
        });
        if (!res.ok) {
          console.error(`Failed to post message to Switch (${res.status}):`, await res.text());
          return false;
        }
        return true;
      } catch (err) {
        console.error('Error dispatching message to Switch bridge:', err);
        return false;
      }
    }

    // In simulated adapter mode, emit message for local room listeners
    this.emit('room_message_broadcast', {
      roomId,
      sender: `@${this.config.agentId}:switchops`,
      senderName: 'SwitchOps AI',
      body: content,
      timestamp: Date.now(),
    });
    return true;
  }
}
