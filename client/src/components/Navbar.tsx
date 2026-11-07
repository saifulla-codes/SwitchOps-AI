import React from 'react';
import { 
  ShieldAlert, 
  Terminal, 
  CheckSquare, 
  Layers, 
  Activity, 
  MessageSquareCode, 
  RotateCcw, 
  Sparkles,
  Radio
} from 'lucide-react';
import type { DashboardSummary } from '../types';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  summary: DashboardSummary | null;
  onTriggerScenario: () => void;
  onResetDemo: () => void;
  isTriggering: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  summary,
  onTriggerScenario,
  onResetDemo,
  isTriggering,
}) => {
  const pendingApprovals = summary?.approvals.pending || 0;
  const activeIncidents = summary?.incidents.active || 0;

  return (
    <header className="sticky top-0 z-50 bg-space-950/80 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20 text-white">
              <Terminal className="w-5 h-5 text-brand-100" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-300 bg-clip-text text-transparent">
                  SwitchOps AI
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/30">
                  Switch AI Teammate
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Autonomous Incident Response & Human Approval Gate
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'dashboard'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              Dashboard
            </button>

            <button
              onClick={() => setCurrentTab('incidents')}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'incidents'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Incidents
              {activeIncidents > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  {activeIncidents}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('approvals')}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'approvals'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Approval Queue
              {pendingApprovals > 0 && (
                <span className="animate-pulse px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {pendingApprovals}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('tasks')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'tasks'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              Tasks
            </button>

            <button
              onClick={() => setCurrentTab('simulator')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'simulator'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <MessageSquareCode className="w-4 h-4" />
              Switch Room
            </button>

            <button
              onClick={() => setCurrentTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'audit'
                  ? 'bg-slate-800 text-brand-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Radio className="w-4 h-4" />
              Audit Trail
            </button>
          </nav>

          {/* Quick Demo Controls */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onTriggerScenario}
              disabled={isTriggering}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-50"
              title="Dispatches realistic 503 incident report into Switch Room"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isTriggering ? 'Simulating...' : 'Trigger P1 Scenario'}
            </button>

            <button
              onClick={onResetDemo}
              className="flex items-center gap-1 p-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
              title="Reset Demo Data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
