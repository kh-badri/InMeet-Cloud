import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Cloud, Sun, Moon, LogOut, Menu, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isSidebarOpen, onToggleSidebar }) => {
  const { user, theme, toggleTheme, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#92B4EC]/70 bg-white px-4 dark:border-[#1E3E62] dark:bg-[#0B192C] sm:px-6 transition-colors">
      <div className="flex items-center gap-3.5">
        {/* Hamburger Toggle Button */}
        <button
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'}
          title={isSidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#92B4EC]/70 bg-white text-slate-700 transition-all hover:bg-[#92B4EC]/20 hover:text-slate-900 active:scale-95 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300 dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500]"
        >
          <Menu className={`h-4.5 w-4.5 transition-transform duration-200 ${isSidebarOpen ? 'rotate-90 text-[#FF6701] dark:text-[#FF6500]' : ''}`} />
        </button>

        {/* Brand Logo & Title with Modern Non-Standard Styling */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-9.5 w-9.5 items-center justify-center rounded-xl bg-[#FF6701] text-white shadow-sm dark:bg-[#FF6500] dark:text-white font-extrabold shrink-0">
            <Cloud className="h-5 w-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
              InMeet
            </span>
            <span className="rounded-lg bg-[#FF6701] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white dark:bg-[#FF6500] dark:text-white">
              Cloud
            </span>
            <div className="hidden items-center gap-1.5 rounded-full border border-[#92B4EC]/60 bg-[#F3F6FD] px-2.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-400 md:flex">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span className="font-mono">AES-256 Vault</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Modern Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Ganti tema"
          title={theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#92B4EC]/70 bg-white text-slate-700 transition-all hover:border-[#FF6701] hover:bg-[#FF6701]/10 hover:text-[#FF6701] active:scale-95 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300 dark:hover:border-[#FF6500] dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500]"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-[#FEA82F] transition-transform hover:rotate-45" />
          ) : (
            <Moon className="h-4 w-4 text-[#1E3E62] transition-transform hover:-rotate-12" />
          )}
        </button>

        {user && (
          <div className="flex items-center gap-2.5">
            {/* User Profile Pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-[#92B4EC]/70 bg-white px-3 py-1.5 dark:border-[#1E3E62] dark:bg-[#000000]">
              <div className="flex flex-col items-start leading-none">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  {user.email}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider text-[#FF6701] dark:text-[#FF6500] mt-0.5 font-bold">
                  {user.role}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              title="Keluar dari sistem"
              aria-label="Logout"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#92B4EC]/70 bg-white text-slate-500 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
