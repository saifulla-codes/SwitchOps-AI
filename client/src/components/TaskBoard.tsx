import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  User, 
  Check,
  ChevronRight
} from 'lucide-react';
import type { IncidentTask } from '../types';
import { api } from '../lib/api';

export const TaskBoard: React.FC = () => {
  const [tasks, setTasks] = useState<IncidentTask[]>([]);
  const [filterOwner, setFilterOwner] = useState<string>('all');

  const fetchTasks = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStatusChange = async (taskId: string, newStatus: IncidentTask['status']) => {
    try {
      await api.updateTaskStatus(taskId, newStatus);
      await fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const owners = Array.from(new Set(tasks.map((t) => t.owner)));
  const filteredTasks = filterOwner === 'all' ? tasks : tasks.filter((t) => t.owner === filterOwner);

  const columns: Array<{
    status: IncidentTask['status'];
    label: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    { status: 'todo', label: 'To Do', icon: <Clock className="w-4 h-4 text-slate-400" />, color: 'border-slate-800' },
    { status: 'in_progress', label: 'In Progress', icon: <AlertCircle className="w-4 h-4 text-cyan-400" />, color: 'border-cyan-800' },
    { status: 'completed', label: 'Completed', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, color: 'border-emerald-800' },
    { status: 'blocked', label: 'Blocked on Approval', icon: <AlertCircle className="w-4 h-4 text-amber-400" />, color: 'border-amber-800' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-brand-400" />
            Operations Task Board
          </h1>
          <p className="text-sm text-slate-400">
            Action items spawned by SwitchOps AI and human teammates during incident workflows.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Filter Assignee:</span>
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="bg-space-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Assignees</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.status);
          return (
            <div
              key={col.status}
              className="bg-space-900/80 border border-slate-800 rounded-xl p-4 space-y-3 min-h-[350px]"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                  {col.icon}
                  <span>{col.label}</span>
                </div>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-lg bg-space-950 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2.5 text-xs shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        task.priority === 'high'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {task.priority}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{task.id}</span>
                    </div>

                    <h4 className="font-semibold text-white leading-snug">{task.title}</h4>
                    {task.description && (
                      <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-cyan-400" />
                        <span className="font-mono text-cyan-300">{task.owner}</span>
                      </div>
                      
                      {/* Action buttons to move status */}
                      <div className="flex items-center gap-1">
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'completed')}
                            className="p-1 rounded hover:bg-emerald-950 text-slate-400 hover:text-emerald-300 transition-colors"
                            title="Mark Completed"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {task.status === 'todo' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'in_progress')}
                            className="p-1 rounded hover:bg-cyan-950 text-slate-400 hover:text-cyan-300 transition-colors"
                            title="Move to In Progress"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
