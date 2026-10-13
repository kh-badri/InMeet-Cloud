import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Database, KeyRound, History, BookOpen, Settings } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'backups' | 'apps' | 'audit' | 'docs' | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  isOpen 
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'backups', label: 'Daftar Backup', icon: <Database className="h-4 w-4" /> },
    { id: 'apps', label: 'Aplikasi & API Key', icon: <KeyRound className="h-4 w-4" />, adminOnly: true },
    { id: 'audit', label: 'Audit Log', icon: <History className="h-4 w-4" />, adminOnly: true },
    { id: 'docs', label: 'Dokumentasi API', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'settings', label: 'Pengaturan', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 top-16 z-30 md:static md:top-auto md:z-auto
        flex flex-col border-r border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-darkSurface
        transition-all duration-300 ease-in-out shrink-0 overflow-hidden
        ${isOpen 
          ? 'w-64 translate-x-0 opacity-100 shadow-xl md:shadow-none' 
          : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-r-0 md:pointer-events-none'
        }
        h-[calc(100vh-4rem)]
      `}
    >
      {/* Inner fixed-width container to prevent text-wrapping during width transition */}
      <div className="w-64 flex flex-col h-full p-4 shrink-0">
        {/* Navigation Items - NO auto-hide on click */}
        <nav className="space-y-1.5 flex-1">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 font-semibold border border-indigo-200/60 dark:border-indigo-900/60 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200'
                }`}
              >
                <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* System Status Badge */}
        <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60 mt-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">InMeet Cloud Aktif</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Enkripsi AES-256-GCM & Retensi Otomatis
          </p>
        </div>
      </div>
    </aside>
  );
};
