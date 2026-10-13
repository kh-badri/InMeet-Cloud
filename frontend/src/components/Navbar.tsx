import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Cloud, Sun, Moon, LogOut, Menu } from 'lucide-react';

interface NavbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isSidebarOpen, onToggleSidebar }) => {
  const { user, theme, toggleTheme, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 dark:border-slate-800/80 dark:bg-darkSurface sm:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger Toggle Button */}
        <button
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'}
          title={isSidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 transition-all hover:bg-slate-200 hover:text-slate-900 active:scale-95 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Menu className={`h-5 w-5 transition-transform duration-200 ${isSidebarOpen ? 'rotate-90 text-indigo-600 dark:text-indigo-400' : ''}`} />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-sm">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              InMeet Cloud
            </span>
            <span className="hidden text-xs font-normal text-slate-400 dark:text-slate-500 sm:inline">
              Backup Storage
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {user && (
          <div className="flex items-center gap-2.5">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                {user.email}
              </span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {user.role}
              </span>
            </div>

            <button
              onClick={() => logout()}
              title="Keluar"
              aria-label="Logout"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:bg-darkSurface dark:text-slate-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
