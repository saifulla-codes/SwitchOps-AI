import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquareCode, 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Code2, 
  Radio
} from 'lucide-react';
import type { SwitchRoom, RoomMessage } from '../types';
import { api } from '../lib/api';

export const SwitchRoomSimulator: React.FC = () => {
  const [rooms, setRooms] = useState<SwitchRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('incidents-ops');
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [senderName, setSenderName] = useState('Alex Chen (Lead SRE)');
  const [showInspector, setShowInspector] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchRooms = async () => {
    try {
      const data = await api.getSwitchRooms();
      setRooms(data);
      if (data.length > 0 && !activeRoomId) {
        setActiveRoomId(data[0].room_id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (roomId: string) => {
    try {
      const msgs = await api.getRoomMessages(roomId);
      setMessages(msgs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (activeRoomId) {
      fetchMessages(activeRoomId);
      const interval = setInterval(() => {
        fetchMessages(activeRoomId);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [activeRoomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    try {
      await api.postRoomMessage(activeRoomId, senderName, inputText);
      setInputText('');
      await fetchMessages(activeRoomId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const activeRoom = rooms.find((r) => r.room_id === activeRoomId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <MessageSquareCode className="w-6 h-6 text-brand-400" />
            Switch Room & Chat Simulator
          </h1>
          <p className="text-sm text-slate-400">
            Simulates team chat platforms (Mattermost, Slack, Teams) connected to Switch AI agents.
          </p>
        </div>

        <button
          onClick={() => setShowInspector(!showInspector)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            showInspector
              ? 'bg-brand-500/20 text-brand-300 border-brand-500/50'
              : 'bg-space-900 text-slate-300 border-slate-700 hover:bg-slate-800'
          }`}
        >
          <Code2 className="w-4 h-4" />
          {showInspector ? 'Hide Protocol Frames' : 'Inspect Switch Wire Protocol'}
        </button>
      </div>

      {/* Protocol Inspector Drawer */}
      {showInspector && (
        <div className="p-4 rounded-xl bg-space-950 border border-brand-500/40 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-brand-300">
            <span className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              Official Switch Agent Protocol (WebSocket Wire Frames)
            </span>
            <span className="text-slate-400 font-mono text-[11px]">Heartbeat: 2000ms ping/pong</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded bg-space-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">INBOUND FRAME SPEC</span>
              <span className="text-cyan-300">WebSocket /connection/ws</span>
              <p className="text-slate-400 text-[11px] mt-1">Filter: <code>addressed=true</code></p>
            </div>
            <div className="p-2.5 rounded bg-space-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">OUTBOUND OPERATION</span>
              <span className="text-emerald-300">POST /agents/id/message</span>
              <p className="text-slate-400 text-[11px] mt-1">Payload: <code>{`{room_id, content}`}</code></p>
            </div>
            <div className="p-2.5 rounded bg-space-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ADDRESSING RULES</span>
              <span className="text-amber-300">owner_and_owner_agents</span>
              <p className="text-slate-400 text-[11px] mt-1">Permission gate enabled</p>
            </div>
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Room Selector & Participants (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-space-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Switch Rooms
            </h3>
            <div className="space-y-1.5">
              {rooms.map((room) => (
                <button
                  key={room.room_id}
                  onClick={() => setActiveRoomId(room.room_id)}
                  className={`w-full text-left p-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${
                    room.room_id === activeRoomId
                      ? 'bg-brand-500/10 text-brand-300 border border-brand-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div>
                    <span className="font-bold text-white block">{room.channel_name}</span>
                    <span className="text-[11px] text-slate-400">{room.name}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {room.platform}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Room Instructions & Participants */}
          {activeRoom && (
            <div className="bg-space-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <div>
                <h4 className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
                  Room Instructions (Shared Context)
                </h4>
                <p className="text-slate-300 italic text-[11px] bg-space-950 p-2.5 rounded border border-slate-800/80 leading-relaxed">
                  "{activeRoom.instructions}"
                </p>
              </div>

              <div>
                <h4 className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1.5">
                  Room Participants ({activeRoom.participants.length})
                </h4>
                <div className="space-y-1.5">
                  {activeRoom.participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded bg-space-950 border border-slate-850">
                      <div className="flex items-center gap-2">
                        {p.type === 'agent' ? (
                          <Bot className="w-3.5 h-3.5 text-cyan-400" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="text-slate-200 font-medium">{p.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{p.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Feed & Composer (Right 8 cols) */}
        <div className="lg:col-span-8 bg-space-900 border border-slate-800 rounded-xl flex flex-col h-[650px] overflow-hidden">
          {/* Room Top Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-space-950/60">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{activeRoom?.channel_name}</span>
              <span className="text-xs text-slate-400">• {activeRoom?.name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Switch Room Connected</span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg) => {
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 text-xs ${
                    msg.isAgent
                      ? 'bg-slate-900/90 border border-brand-500/30 p-4 rounded-xl shadow-md shadow-brand-950/20'
                      : 'p-3 rounded-lg hover:bg-slate-850/40'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {msg.isAgent ? (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                        <Bot className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${msg.isAgent ? 'text-brand-300' : 'text-white'}`}>
                        {msg.senderName}
                      </span>
                      {msg.isAgent && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                          AI TEAMMATE
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.body}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2 border-t border-slate-800 bg-space-950/40 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-brand-400" />
              Quick prompts:
            </span>
            <button
              onClick={() => setInputText('@switchops-ai Payment checkout is throwing 503 errors and DB connection pool errors in production!')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] whitespace-nowrap transition-colors"
            >
              🚨 503 Outage Report
            </button>
            <button
              onClick={() => setInputText('@switchops-ai Can you check health for payment-service?')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] whitespace-nowrap transition-colors"
            >
              🔍 Health Check
            </button>
            <button
              onClick={() => setInputText('@switchops-ai What changed in checkout-service deployments recently?')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] whitespace-nowrap transition-colors"
            >
              📦 Deployments
            </button>
          </div>

          {/* Composer */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-space-950 flex items-center gap-2">
            <select
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="bg-space-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500 shrink-0"
            >
              <option value="Alex Chen (Lead SRE)">Alex Chen (SRE)</option>
              <option value="Sarah Kumar (Platform)">Sarah Kumar (Backend)</option>
              <option value="Jordan Miller (Payments)">Jordan Miller (Payments)</option>
            </select>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tag @switchops-ai with an issue or request..."
              className="flex-1 bg-space-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />

            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white disabled:opacity-50 transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
