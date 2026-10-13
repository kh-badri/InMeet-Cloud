import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Database, KeyRound, History, Settings } from 'lucide-react';
import { ActiveTab } from './Sidebar';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Beranda', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'backups', label: 'Backup', icon: <Database className="h-5 w-5" /> },
    { id: 'apps', label: 'Aplikasi', icon: <KeyRound className="h-5 w-5" />, adminOnly: true },
    { id: 'audit', label: 'Audit', icon: <History className="h-5 w-5" />, adminOnly: true },
    { id: 'settings', label: 'Setelan', icon: <Settings className="h-5 w-5" /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 md:hidden items-center justify-around border-t border-slate-200/80 bg-white px-2 dark:border-slate-800/80 dark:bg-darkSurface pb-safe">
      {navItems.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] py-1 transition-colors ${
              isActive
                ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <div className={`transition-transform ${isActive ? 'scale-105' : ''}`}>
              {item.icon}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
