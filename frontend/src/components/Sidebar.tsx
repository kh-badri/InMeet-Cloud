import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Database, KeyRound, History, 
  BookOpen, Settings, HardDrive, ShieldCheck 
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'backups' | 'apps' | 'audit' | 'docs' | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  isOpen,
  onClose 
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const primaryItems: { id: ActiveTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'backups', label: 'Daftar Backup', icon: <Database className="h-4 w-4" /> },
    { id: 'apps', label: 'Aplikasi & API Key', icon: <KeyRound className="h-4 w-4" />, adminOnly: true },
  ];

  const systemItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string; adminOnly?: boolean }[] = [
    { id: 'audit', label: 'Audit Log', icon: <History className="h-4 w-4" />, adminOnly: true },
    { id: 'docs', label: 'Dokumentasi API', icon: <BookOpen className="h-4 w-4" />, badge: 'v1.0' },
    { id: 'settings', label: 'Pengaturan', icon: <Settings className="h-4 w-4" /> },
  ];

  const renderItem = (item: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string; adminOnly?: boolean }) => {
    if (item.adminOnly && !isAdmin) return null;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => {
          onTabChange(item.id);
          if (onClose && typeof window !== 'undefined' && window.innerWidth < 768) {
            onClose();
          }
        }}
        className={`group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors duration-150 ${
          isActive
            ? 'bg-[#92B4EC]/20 text-[#FF6701] border border-[#FF6701]/30 dark:bg-[#1E3E62] dark:text-[#FF6500] dark:border-[#FF6500]/50'
            : 'text-slate-600 hover:bg-[#92B4EC]/15 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1E3E62]/40 dark:hover:text-white border border-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`transition-colors duration-150 ${
            isActive 
              ? 'text-[#FF6701] dark:text-[#FF6500]' 
              : 'text-slate-400 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
          }`}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </div>

        {item.badge && (
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold ${
            isActive
              ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-black'
              : 'bg-[#92B4EC]/25 text-slate-700 dark:bg-[#000000] dark:text-[#FEA82F] border border-[#92B4EC]/40 dark:border-[#1E3E62]'
          }`}>
            {item.badge}
          </span>
        )}

        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#FF6701] dark:bg-[#FF6500]" />
        )}
      </button>
    );
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 top-16 z-30
        md:sticky md:top-16 md:self-start
        flex flex-col border-r border-[#92B4EC]/70 bg-white dark:border-[#1E3E62] dark:bg-[#0B192C]
        transition-all duration-200 ease-out shrink-0
        ${isOpen 
          ? 'w-64 translate-x-0 opacity-100 shadow-md md:shadow-none' 
          : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-r-0 md:pointer-events-none'
        }
        h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]
      `}
    >
      {/* Fixed-width inner container with independent clean scrollbar */}
      <div className="w-64 flex flex-col h-full p-3.5 shrink-0 justify-between overflow-y-auto overflow-x-hidden">
        {/* Navigation Items */}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-slate-400 dark:text-slate-500">
              Penyimpanan
            </div>
            <nav className="space-y-1">
              {primaryItems.map(renderItem)}
            </nav>
          </div>

          <div className="space-y-1 pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/70">
            <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-slate-400 dark:text-slate-500">
              Sistem & Panduan
            </div>
            <nav className="space-y-1">
              {systemItems.map(renderItem)}
            </nav>
          </div>
        </div>

        {/* Modern Cloud Telemetry Node Widget */}
        <div className="mt-4 rounded-2xl border border-[#92B4EC]/70 bg-[#F3F6FD] p-3.5 dark:border-[#1E3E62] dark:bg-[#000000] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                InMeet Storage
              </span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white text-[#FF6701] font-bold border border-[#92B4EC]/60 dark:bg-[#0B192C] dark:text-[#FF6500] dark:border-[#1E3E62]">
              ACTIVE
            </span>
          </div>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
            Enkripsi AES-256-GCM dengan cron retensi harian otomatis.
          </p>

          <div className="mt-2.5 pt-2 border-t border-[#92B4EC]/40 dark:border-[#1E3E62] flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-[#FF6701] dark:text-[#FF6500]" />
              Local Vault
            </span>
            <span className="flex items-center gap-1 text-[#FEA82F] font-bold">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              100% SECURE
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
