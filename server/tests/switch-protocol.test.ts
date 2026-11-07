import { describe, it, expect } from 'vitest';
import { SwitchAgentClient } from '../src/switch/client.js';
import { SwitchSimulatorAdapter } from '../src/switch/adapter.js';

describe('Switch Agent Protocol & Adapter Verification', () => {
  it('correctly initializes Switch client with protocol defaults', () => {
    const client = new SwitchAgentClient({
      agentId: 'switchops-ai',
      rooms: ['incidents-ops', 'checkout-team'],
    });

    const status = client.getStatus();
    expect(status.agentId).toBe('switchops-ai');
    expect(status.rooms).toEqual(['incidents-ops', 'checkout-team']);
    expect(status.simulated).toBe(true);
    expect(status.connectionId).toMatch(/^conn-/);
  });

  it('simulator adapter filters addressed messages appropriately', () => {
    const simulator = new SwitchSimulatorAdapter();
    const rooms = simulator.getRooms();

    expect(rooms.length).toBeGreaterThanOrEqual(2);
    expect(rooms[0].room_id).toBe('incidents-ops');

    let receivedAddressedEvent: any = null;
    simulator.on('message', (evt) => {
      receivedAddressedEvent = evt;
    });

    // 1. Post message not addressed to agent
    simulator.simulateInboundMessage('incidents-ops', 'Jordan Miller', 'Hey team, lunch at 12?');
    expect(receivedAddressedEvent.addressed).toBe(false);

    // 2. Post message addressing the agent
    simulator.simulateInboundMessage('incidents-ops', 'Alex Chen', '@switchops-ai Checkout service latency is spiking!');
    expect(receivedAddressedEvent.addressed).toBe(true);
    expect(receivedAddressedEvent.senderName).toBe('Alex Chen');
    expect(receivedAddressedEvent.roomId).toBe('incidents-ops');
  });
});
