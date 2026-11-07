import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Terminal, 
  CheckSquare, 
  GitCommit, 
  Server, 
  Database,
  ArrowRight
} from 'lucide-react';
import type { Incident, IncidentTask, Approval, AuditLog } from '../types';
import { api } from '../lib/api';

interface IncidentHubProps {
  onNavigateTab: (tab: string) => void;
}

export const IncidentHub: React.FC<IncidentHubProps> = ({ onNavigateTab }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(Incident & {
    tasks: IncidentTask[];
    approvals: Approval[];
    audit: AuditLog[];
    trace: any[];
  }) | null>(null);


  const fetchIncidents = async () => {
    try {
      const list = await api.getIncidents();
      setIncidents(list);
      if (!selectedIncidentId && list.length > 0) {
        setSelectedIncidentId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDetail = async (id: string) => {
    try {
      const data = await api.getIncidentDetail(id);
      setDetail(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  useEffect(() => {
    if (selectedIncidentId) {
      fetchDetail(selectedIncidentId);
    }
  }, [selectedIncidentId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            Incident Command Center
          </h1>
          <p className="text-sm text-slate-400">
            Autonomous diagnosis, correlated telemetry evidence, and execution history.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Incident List (Left Column) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            All Incidents ({incidents.length})
          </div>
          {incidents.map((inc) => {
            const isSelected = inc.id === selectedIncidentId;
            return (
              <div
                key={inc.id}
                onClick={() => setSelectedIncidentId(inc.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-brand-500 shadow-md shadow-brand-500/10'
                    : 'bg-space-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold tracking-wide uppercase ${
                    inc.priority === 'P1'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {inc.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                    inc.status === 'resolved'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-300'
                  }`}>
                    {inc.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white mt-2 line-clamp-1">
                  {inc.title}
                </h4>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {inc.description}
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-2">
                  <span className="font-mono text-cyan-400">{inc.service}</span>
                  <span>{new Date(inc.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Incident Detail (Right Column) */}
        <div className="lg:col-span-8 space-y-6">
          {detail ? (
            <div className="bg-space-900 border border-slate-800 rounded-xl p-6 space-y-6">
              {/* Header */}
              <div className="space-y-3 border-b border-slate-800 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                    detail.priority === 'P1' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {detail.priority} Critical
                  </span>
                  <span className="text-xs font-mono text-slate-400 font-semibold">{detail.id}</span>
                  <span className="text-xs text-slate-600">•</span>
                  <span className="text-xs font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                    {detail.service}
                  </span>
                  <span className="text-xs text-slate-600">•</span>
                  <span className="text-xs text-slate-400">Room: <code className="text-brand-300 font-mono">#{detail.room_id}</code></span>
                </div>
                <h2 className="text-xl font-bold text-white">{detail.title}</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{detail.description}</p>
              </div>

              {/* Pending Approval Callout if applicable */}
              {detail.approvals.some((a) => a.status === 'pending') && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-600/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <CheckSquare className="w-4 h-4 animate-bounce" />
                      Privileged Action Awaiting Human Authorization
                    </div>
                    <p className="text-xs text-amber-200/80">
                      The AI agent has proposed <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded text-amber-300">scale_db_pool_and_restart</code>. Execution is suspended until human sign-off.
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigateTab('approvals')}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    Review in Approval Queue <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Autonomous Investigation Evidence Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-brand-400" />
                  Autonomous Investigation Findings & Telemetry Evidence
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg bg-space-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Server className="w-4 h-4 text-cyan-400" />
                      Health & Error Rates
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      HTTP 503 error spike (18.7%). P99 latency degraded to 2,450ms. 2 of 5 pod replicas failed liveness probes.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-space-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Database className="w-4 h-4 text-rose-400" />
                      Connection Pool Saturation
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Aurora PostgreSQL pool 100% saturated (50/50 max connections occupied, 142 blocked worker threads).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-space-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <GitCommit className="w-4 h-4 text-amber-400" />
                      Deployment Correlation
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Deployment <code className="font-mono text-cyan-300">v2.14.2</code> committed 45m ago altered connection acquire timeout logic in <code className="font-mono text-slate-300">db/pool.ts</code>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-space-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Resolution State
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      {detail.status === 'resolved'
                        ? 'Remediation completed. Pool capacity expanded to 150. Service latency restored to 115ms.'
                        : 'Action plan staged. Awaiting security approval before applying cluster mutation.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tasks Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400" />
                  Incident Tasks ({detail.tasks.length})
                </h3>
                <div className="space-y-2">
                  {detail.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-lg bg-space-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-semibold text-white">{task.title}</span>
                        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                          <span>Assignee: <code className="text-brand-300">{task.owner}</code></span>
                          <span>•</span>
                          <span className="uppercase text-[10px] font-bold text-amber-400">{task.priority}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        task.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-space-900 border border-slate-800 rounded-xl">
              Select an incident to view investigation history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
