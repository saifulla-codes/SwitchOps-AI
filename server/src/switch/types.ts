export interface SwitchMessagePayload {
  addressed: boolean;
  sender: string;
  sender_name: string;
  message_id: string;
  body: string;
  timestamp: number;
  thread_id?: string | null;
  attachments?: Array<{
    filename: string;
    mimetype: string;
    size: number;
    mxc: string;
    msgtype: string;
  }>;
}

export interface SwitchDomainEvent {
  event: 'message' | 'command' | 'room_join';
  id: number;
  data: {
    type: 'message' | 'command' | 'room_join';
    room_id: string;
    bridge_id?: string | null;
    channel_type?: string | null;
    sequence: number;
    payload: SwitchMessagePayload;
  };
}

export interface SwitchConnectionStateFrame {
  type: 'connection_state';
  connection_id: string;
  agent_id: string;
  generation: string;
  scope: 'single' | 'all';
  filter: 'all' | 'addressed';
  rooms: string[];
  cursor: number;
  protocol: number;
  heartbeat_interval_seconds: number;
}

export interface SwitchPingFrame {
  type: 'ping';
}

export interface SwitchPongFrame {
  type: 'pong';
  cursor: number;
}

export interface SwitchRefusedFrame {
  type: 'refused';
  status: number;
  detail: string;
}

export interface SwitchEvictedFrame {
  type: 'evicted';
  code: 'taken_over' | 'heartbeat_lapsed' | 'no_stream' | 'closed';
  reason: string;
}

export interface SwitchRoomContext {
  room_id: string;
  name: string;
  channel_name: string;
  platform: 'mattermost' | 'slack' | 'teams' | 'discord' | 'telegram';
  instructions?: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    type: 'user' | 'agent' | 'admin';
  }>;
}
