import React from 'react';
import { 
  ShieldAlert, 
  CheckSquare, 
  Layers, 
  Wifi, 
  ArrowRight, 
  ExternalLink,
  Clock,
  User,
  Sparkles,
  Bot
} from 'lucide-react';
import type { DashboardSummary, Incident } from '../types';

interface DashboardProps {
  summary: DashboardSummary | null;
  incidents: Incident[];
  onNavigateTab: (tab: string) => void;
  onTriggerScenario: () => void;
  isTriggering: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  summary,
  incidents,
  onNavigateTab,
  onTriggerScenario,
  isTriggering,
}) => {
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const latestIncident = activeIncidents[0] || incidents[0];

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-space-900 via-slate-900 to-space-900 border border-slate-800 p-6 md:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-300 border border-brand-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Flip the Switch Hackathon · Best Business Workflow Track
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Autonomous Incident Response with Human-in-the-Loop Safeguards
            </h1>
            <p className="text-sm md:text-base text-slate-300">
              SwitchOps AI connects directly to your team's chat rooms (Mattermost, Slack, Teams) via the official Switch Agent Protocol. It triages failures, executes diagnostic telemetry tools, builds action plans, and halts for human sign-off before privileged remediation.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onNavigateTab('simulator')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all"
            >
              <Bot className="w-4 h-4 text-brand-400" />
              Open Switch Room
            </button>
            <button
              onClick={onTriggerScenario}
              disabled={isTriggering}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isTriggering ? 'Simulating...' : 'Run Incident Demo'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Open Incidents */}
        <div 
          onClick={() => onNavigateTab('incidents')}
          className="group relative bg-space-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-rose-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Incidents</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {summary?.incidents.active ?? 0}
            </span>
            <span className="text-xs text-slate-400">
              of {summary?.incidents.total ?? 0} total
            </span>
          </div>
          <div className="mt-3 flex items-center text-xs text-rose-400 font-medium group-hover:underline">
            Inspect incident queue <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Pending Approvals */}
        <div 
          onClick={() => onNavigateTab('approvals')}
          className="group relative bg-space-900 border border-slate-800 hover:border-amber-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-amber-950/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <CheckSquare className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {summary?.approvals.pending ?? 0}
            </span>
            {(summary?.approvals.pending ?? 0) > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                Action Required
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center text-xs text-amber-400 font-medium group-hover:underline">
            Review security gates <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Active Tasks */}
        <div 
          onClick={() => onNavigateTab('tasks')}
          className="group relative bg-space-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-cyan-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In-Flight Tasks</span>
            <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {summary?.tasks.active ?? 0}
            </span>
            <span className="text-xs text-slate-400">
              ({summary?.tasks.completed ?? 0} completed)
            </span>
          </div>
          <div className="mt-3 flex items-center text-xs text-brand-400 font-medium group-hover:underline">
            View task kanban <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Switch Connection Status */}
        <div 
          onClick={() => onNavigateTab('simulator')}
          className="group relative bg-space-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Switch Bridge</span>
            <div className={`p-2 rounded-lg ${summary?.switchStatus.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
              <Wifi className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${summary?.switchStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-sm font-bold text-white">
                {summary?.switchStatus.simulated ? 'Test Adapter Active' : 'Live WebSocket'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              Agent: <code className="text-brand-300 font-mono">@{summary?.switchStatus.agentId}</code>
            </p>
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-400 font-medium group-hover:underline">
            Rooms: #{summary?.switchStatus.rooms.join(', #')}
          </div>
        </div>
      </div>

      {/* Main Grid: Live Incident & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Incident Card */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-brand-400" />
              Active Incident Spotlight
            </h2>
            <button 
              onClick={() => onNavigateTab('incidents')}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              View all ({incidents.length}) <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {latestIncident ? (
            <div className="bg-space-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-extrabold tracking-wide uppercase ${
                    latestIncident.priority === 'P1'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {latestIncident.priority} Critical
                  </span>
                  <span className="text-xs font-mono text-slate-400 font-medium">{latestIncident.id}</span>
                  <span className="text-xs text-slate-500">•</span>
                  <span className="text-xs font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                    {latestIncident.service}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                    latestIncident.status === 'resolved'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  }`}>
                    {latestIncident.status}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white">
                  {latestIncident.title}
                </h3>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  {latestIncident.description}
                </p>
              </div>

              {/* Progress & Context */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-space-950/60 rounded-lg border border-slate-800/60 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Reporter</span>
                  <span className="text-slate-200 font-semibold">{latestIncident.reporter}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Switch Room</span>
                  <span className="text-brand-300 font-mono">#{latestIncident.room_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Tasks Resolved</span>
                  <span className="text-slate-200 font-semibold">
                    {latestIncident.tasksCompleted ?? 0} / {latestIncident.tasksTotal ?? 0}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => onNavigateTab('incidents')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-slate-950 transition-colors"
                >
                  Inspect Incident & Evidence
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-space-900 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <ShieldAlert className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium">No incidents logged yet.</p>
              <p className="text-xs text-slate-500 mt-1">Click "Run Incident Demo" above to simulate an incoming failure report.</p>
            </div>
          )}

          {/* Workflow Diagram Banner */}
          <div className="bg-space-900/60 border border-slate-800/80 rounded-xl p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Switch Business Workflow Lifecycle
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                <span className="font-bold text-cyan-300 block">1. Team Chat</span>
                <span className="text-[11px] text-slate-400">Request in Room</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                <span className="font-bold text-cyan-300 block">2. Ingest & Ack</span>
                <span className="text-[11px] text-slate-400">Switch Protocol</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                <span className="font-bold text-cyan-300 block">3. Diagnostics</span>
                <span className="text-[11px] text-slate-400">Logs & Metrics</span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-700/50">
                <span className="font-bold text-amber-300 block">4. Human Gate</span>
                <span className="text-[11px] text-amber-400">Explicit Approval</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-700/50">
                <span className="font-bold text-emerald-300 block">5. Remediation</span>
                <span className="text-[11px] text-emerald-400">Outcome & Post-mortem</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-400" />
              Live Audit Trail
            </h2>
            <button 
              onClick={() => onNavigateTab('audit')}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              Full log <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-space-900 border border-slate-800 rounded-xl p-4 divide-y divide-slate-800/70">
            {summary?.recentLogs && summary.recentLogs.length > 0 ? (
              summary.recentLogs.map((log) => (
                <div key={log.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-cyan-400 font-semibold">{log.event_type}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <User className="w-3 h-3 text-slate-500" />
                    <span>{log.actor}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">No recent audit logs.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
