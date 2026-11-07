import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { IncidentHub } from './components/IncidentHub';
import { ApprovalQueue } from './components/ApprovalQueue';
import { TaskBoard } from './components/TaskBoard';
import { SwitchRoomSimulator } from './components/SwitchRoomSimulator';
import { AuditLogViewer } from './components/AuditLogViewer';
import { api } from './lib/api';
import type { DashboardSummary, Incident } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isTriggering, setIsTriggering] = useState(false);

  const loadData = async () => {
    try {
      const [sum, incs] = await Promise.all([
        api.getSummary(),
        api.getIncidents(),
      ]);
      setSummary(sum);
      setIncidents(incs);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerScenario = async () => {
    setIsTriggering(true);
    try {
      await api.triggerScenario('incidents-ops');
      // Jump to Switch room simulator to see the live chat!
      setCurrentTab('simulator');
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleResetDemo = async () => {
    if (window.confirm('Reset demo state and clear all incidents & approvals?')) {
      try {
        await api.resetDemo();
        await loadData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-space-950 text-slate-100">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        summary={summary}
        onTriggerScenario={handleTriggerScenario}
        onResetDemo={handleResetDemo}
        isTriggering={isTriggering}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'dashboard' && (
          <Dashboard
            summary={summary}
            incidents={incidents}
            onNavigateTab={setCurrentTab}
            onTriggerScenario={handleTriggerScenario}
            isTriggering={isTriggering}
          />
        )}

        {currentTab === 'incidents' && (
          <IncidentHub onNavigateTab={setCurrentTab} />
        )}

        {currentTab === 'approvals' && (
          <ApprovalQueue onApprovalProcessed={loadData} />
        )}

        {currentTab === 'tasks' && (
          <TaskBoard />
        )}

        {currentTab === 'simulator' && (
          <SwitchRoomSimulator />
        )}

        {currentTab === 'audit' && (
          <AuditLogViewer />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-space-950/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">SwitchOps AI</span>
            <span>•</span>
            <span>Built for the <strong>Flip the Switch Hackathon</strong> (Best Business Workflow Track)</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Official Protocol: <code className="text-cyan-400 font-mono">docs.switchagents.ai</code></span>
            <span>•</span>
            <span className="text-emerald-400 font-medium">● Local Test Adapter Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
