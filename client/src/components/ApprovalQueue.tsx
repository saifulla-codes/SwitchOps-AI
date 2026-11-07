import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  ShieldAlert, 
  AlertTriangle, 
  Check, 
  X, 
  Lock, 
  Server, 
  UserCheck,
  Hash,
  Cpu,
  Info,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import type { Approval, UserPersona } from '../types';
import { api, getAuthToken, setAuthToken } from '../lib/api';

interface ApprovalQueueProps {
  onApprovalProcessed?: () => void;
}

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({ onApprovalProcessed }) => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [selectedPersonaToken, setSelectedPersonaToken] = useState<string>(getAuthToken());
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchApprovals = async () => {
    try {
      const data = await api.getApprovals();
      if (Array.isArray(data)) {
        setApprovals(data);
      }
    } catch (err: any) {
      console.error('Failed to load approvals:', err);
    }
  };

  const fetchPersonas = async () => {
    try {
      const list = await api.getPersonas();
      setPersonas(list);
    } catch (err: any) {
      console.error('Failed to load personas:', err);
    }
  };

  useEffect(() => {
    fetchApprovals();
    fetchPersonas();
    const interval = setInterval(fetchApprovals, 2500);
    return () => clearInterval(interval);
  }, []);

  const handlePersonaChange = (token: string) => {
    setSelectedPersonaToken(token);
    setAuthToken(token);
    setStatusMessage(null);
    fetchApprovals();
  };

  const activePersona = personas.find((p) => p.token === selectedPersonaToken) || {
    id: 'usr-unknown',
    name: 'Unknown Operator',
    email: 'unknown@switchops.local',
    role: 'viewer' as const,
    title: 'Unauthenticated User',
    token: selectedPersonaToken,
    permissions: [],
  };

  const handleDecision = async (approvalId: string, approved: boolean) => {
    setProcessingId(approvalId);
    setStatusMessage(null);
    try {
      const res = await api.decideApproval(
        approvalId,
        approved,
        reviewerNotes || (approved ? `Authorized by ${activePersona.name} (${activePersona.title})` : 'Action declined')
      );
      setStatusMessage({
        type: 'success',
        text: approved
          ? `✅ Authorized and executed remediation: ${res.executionResult?.data?.action || 'action completed successfully'}`
          : '❌ Action was rejected. Autonomous execution permanently halted.',
      });
      setReviewerNotes('');
      await fetchApprovals();
      if (onApprovalProcessed) onApprovalProcessed();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error (${err.status || 403}): ${err.message}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pastApprovals = approvals.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <CheckSquare className="w-6 h-6 text-amber-400" />
            Human Approval & Security Guardrails
          </h1>
          <p className="text-sm text-slate-400">
            Privileged operations (cluster restarts, database scaling, rollbacks) are intercepted and held until explicit human sign-off.
          </p>
        </div>
        <button
          onClick={async () => {
            setIsRefreshing(true);
            await fetchApprovals();
            setTimeout(() => setIsRefreshing(false), 500);
          }}
          disabled={isRefreshing}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
          title="Refresh approval queue"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-sm font-semibold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Security Context & Reviewer Persona Switcher */}
      <div className="p-4 rounded-xl bg-space-900 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-cyan-400" />
            <div>
              <span className="text-xs text-slate-400 block font-medium">Active Reviewer Persona:</span>
              <select
                value={selectedPersonaToken}
                onChange={(e) => handlePersonaChange(e.target.value)}
                className="bg-space-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-cyan-500 mt-1"
              >
                {personas.map((p) => (
                  <option key={p.token} value={p.token}>
                    {p.name} — {p.title} ({p.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Server-Enforced Role Authorization</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono">
              <Hash className="w-3.5 h-3.5 text-cyan-400" />
              <span>SHA-256 Payload Hash Binding</span>
            </div>
          </div>
        </div>

        {/* Persona Details & Effective Permissions */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Effective Permissions:</span>
          {activePersona.permissions?.map((perm) => (
            <span
              key={perm}
              className={`px-2 py-0.5 rounded font-mono ${
                perm.startsWith('approve_critical')
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                  : perm.startsWith('approve')
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {perm}
            </span>
          ))}
          {(!activePersona.permissions || activePersona.permissions.length === 0) && (
            <span className="text-rose-400 italic">No privileged permissions assigned (read-only)</span>
          )}
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Pending Action Authorizations ({pendingApprovals.length})
          </h2>
        </div>

        {pendingApprovals.length > 0 ? (
          <div className="space-y-4">
            {pendingApprovals.map((appr) => (
              <div
                key={appr.id}
                className="bg-space-900 border-2 border-amber-500/40 rounded-xl p-6 space-y-4 shadow-lg shadow-amber-950/20"
              >
                {/* Meta */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded text-xs font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/50">
                      {appr.risk_level} Risk
                    </span>
                    <span className="text-xs font-mono text-slate-400 font-bold">{appr.id}</span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs text-slate-300 font-semibold">{appr.incident_title}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Requested by: <code className="text-brand-300">{appr.requested_by}</code>
                  </span>
                </div>

                {/* Proposed Action */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white">Proposed Operation:</span>
                    <code className="text-sm font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
                      {appr.action_name}
                    </code>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-cyan-400" />
                      Simulated Cluster Remediation - Deterministic Telemetry Engine
                    </span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-700/40 text-xs text-amber-200 leading-relaxed">
                    <strong className="block text-amber-300 mb-1 font-semibold">Assessment & Consequences:</strong>
                    {appr.consequences_summary}
                  </div>
                </div>

                {/* Parameters Diff / Payload & Cryptographic Binding */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-wider">Payload Parameters:</span>
                    {appr.payload_hash && (
                      <span className="font-mono text-[11px] text-cyan-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        SHA-256: <code className="text-slate-300">{appr.payload_hash.substring(0, 16)}...</code>
                      </span>
                    )}
                  </div>
                  <pre className="p-3 rounded-lg bg-space-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
                    {JSON.stringify(appr.action_payload, null, 2)}
                  </pre>
                </div>

                {/* Reviewer Note Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Reviewer Justification / Note:</label>
                  <input
                    type="text"
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="e.g. Verified DB replica headroom; authorized to proceed with rolling restart"
                    className="w-full bg-space-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Decision Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-500" />
                    <span>Decision will be recorded under: <strong className="text-slate-200">{activePersona.name}</strong></span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDecision(appr.id, false)}
                      disabled={processingId === appr.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 border border-slate-700 hover:border-rose-700 transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4 text-rose-400" />
                      Reject Action
                    </button>
                    <button
                      onClick={() => handleDecision(appr.id, true)}
                      disabled={processingId === appr.id}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      {processingId === appr.id ? 'Executing...' : 'Approve & Execute Remediation'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-space-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <ShieldAlert className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <p className="text-sm font-semibold text-white">All Clear — No Pending Approvals</p>
            <p className="text-xs text-slate-500 mt-1">When an AI agent proposes a privileged action, it will appear here for human authorization.</p>
          </div>
        )}
      </div>

      {/* Historical Approvals */}
      <div className="space-y-3 pt-6 border-t border-slate-800">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
          Resolved Approvals Audit ({pastApprovals.length})
        </h2>
        <div className="bg-space-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
          {pastApprovals.map((appr) => {
            const isApprovedOrExecuted = appr.status === 'executed' || appr.status === 'approved';
            const isFailed = appr.status === 'failed';

            return (
              <div key={appr.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        isApprovedOrExecuted
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isFailed
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {appr.status}
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">{appr.action_name}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">{appr.incident_title}</span>
                    {appr.payload_hash && (
                      <span className="text-[10px] font-mono text-slate-500">
                        hash: {appr.payload_hash.substring(0, 8)}...
                      </span>
                    )}
                  </div>
                  {appr.reviewer_notes && (
                    <p className="text-slate-400 text-[11px] italic">"{appr.reviewer_notes}"</p>
                  )}
                </div>
                <div className="text-right text-[11px] text-slate-500 whitespace-nowrap">
                  <span>By: <strong className="text-slate-300">{appr.approved_by || 'Reviewer'}</strong></span>
                  <span className="block">{new Date(appr.resolved_at || appr.created_at).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
