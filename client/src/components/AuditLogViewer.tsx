import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Search, 
  Filter, 
  User, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  Hash,
  RefreshCw,
  Info
} from 'lucide-react';
import type { AuditLog, AuditVerificationResult } from '../types';
import { api } from '../lib/api';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchLogs = async () => {
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  const runVerification = async () => {
    setIsVerifying(true);
    try {
      const result = await api.verifyAuditChain();
      setVerification(result);
    } catch (err) {
      console.error('Audit verification failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    runVerification();
  }, []);

  const eventTypes = Array.from(new Set(logs.map((l) => l.event_type)));

  const filtered = logs.filter((l) => {
    const matchesSearch =
      l.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(l.details).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.entry_hash && l.entry_hash.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = selectedEventType === 'all' || l.event_type === selectedEventType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Radio className="w-6 h-6 text-brand-400" />
          System & Workflow Audit Trail
        </h1>
        <p className="text-sm text-slate-400">
          Append-only verifiable record of all agent decisions, diagnostic actions, human approvals, and Switch room events.
        </p>
      </div>

      {/* Cryptographic Chain Integrity Banner */}
      <div className="p-4 rounded-xl bg-space-900 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {verification?.verified ? (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  {verification?.verified
                    ? 'Cryptographic Hash Chain Verified'
                    : 'Audit Trail Integrity Warning'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    verification?.verified
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {verification?.verified ? 'Valid & Tamper-Evident' : 'Chain Broken'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {verification?.verified
                  ? `${verification.totalRecords} audit log entries cryptographically chained back to Genesis anchor via SHA-256.`
                  : `Verification error: ${verification?.brokenAt?.reason || 'Hash mismatch detected in audit log sequence'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchLogs();
                runVerification();
              }}
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              Re-Verify Chain
            </button>
          </div>
        </div>

        {verification?.headHash && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
            <div className="flex items-center gap-1">
              <Hash className="w-3 h-3 text-cyan-400" />
              <span>Head Hash:</span>
              <code className="text-cyan-300 bg-space-950 px-2 py-0.5 rounded border border-slate-800">
                {verification.headHash}
              </code>
            </div>
            <div className="flex items-center gap-1 text-slate-500 text-[10px]">
              <Info className="w-3 h-3 text-slate-500" />
              <span>Local tamper-evident SQLite chain. Production audit requires external WORM storage.</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-space-900 border border-slate-800 p-3 rounded-xl text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audit trail or hash..."
            className="bg-space-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-full sm:w-64"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="bg-space-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Event Types ({logs.length})</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-space-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
        {filtered.map((log) => {
          const isExpanded = expandedId === log.id;
          return (
            <div key={log.id} className="p-4 space-y-2 hover:bg-slate-850/30 transition-colors">
              <div
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-cyan-300 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                    {log.event_type}
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>{log.actor}</span>
                  </div>
                  {log.incident_id && (
                    <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-800/30">
                      {log.incident_id}
                    </span>
                  )}
                  {log.entry_hash && (
                    <span className="text-[10px] font-mono text-slate-500 hidden md:inline">
                      hash: {log.entry_hash.substring(0, 10)}...
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Collapsed summary preview */}
              {!isExpanded && (
                <div className="text-[11px] text-slate-400 truncate font-mono">
                  {JSON.stringify(log.details)}
                </div>
              )}

              {/* Expanded JSON Inspector & Cryptographic Details */}
              {isExpanded && (
                <div className="pt-2 space-y-2">
                  {(log.entry_hash || log.prev_hash) && (
                    <div className="p-2.5 rounded-lg bg-space-950 border border-slate-800/90 text-[10px] font-mono text-slate-400 space-y-1">
                      {log.prev_hash && (
                        <div className="truncate">
                          <span className="text-slate-500">Previous Hash:</span> {log.prev_hash}
                        </div>
                      )}
                      {log.entry_hash && (
                        <div className="truncate text-cyan-400">
                          <span className="text-slate-500">Entry Hash:</span> {log.entry_hash}
                        </div>
                      )}
                    </div>
                  )}
                  <pre className="p-3 rounded-lg bg-space-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-xs">
            No audit log entries matching filters.
          </div>
        )}
      </div>
    </div>
  );
};
