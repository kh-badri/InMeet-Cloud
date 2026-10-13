import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { DashboardPage } from './pages/DashboardPage';
import { BackupsPage } from './pages/BackupsPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { DocsPage } from './pages/DocsPage';
import { SettingsPage } from './pages/SettingsPage';
import { Cloud, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Sidebar persistence: user preference stays unhidden without auto-hiding
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('inmeet_sidebar_open');
    if (saved !== null) {
      return saved === 'true';
    }
    return true; // Default unhidden (open)
  });

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('inmeet_sidebar_open', String(next));
      return next;
    });
  };

  const handleTabChange = (newTab: ActiveTab) => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
  };

  // Modern, Minimalist & Calming Splash Loading Screen
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lightBg dark:bg-darkBg p-4 selection:bg-[#FF6701] dark:selection:bg-[#FF6500] selection:text-white">
        <div className="flex flex-col items-center gap-5 max-w-xs text-center animate-fade-in">
          {/* Logo with Soft Ambient Halo */}
          <div className="relative flex items-center justify-center">
            <div className="absolute h-16 w-16 rounded-2xl bg-[#FF6701]/20 dark:bg-[#FF6500]/25 animate-pulse-glow" />
            <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FEA82F] to-[#FF6701] dark:from-[#FF6500] dark:to-[#1E3E62] flex items-center justify-center text-white shadow-md shadow-[#FF6701]/30 dark:shadow-[#FF6500]/20">
              <Cloud className="h-6 w-6" />
            </div>
          </div>

          {/* Clean Typography */}
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              InMeet Cloud
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Memuat sistem penyimpanan aman...
            </p>
          </div>

          {/* Sleek Precision Indeterminate Loading Track */}
          <div className="w-44 h-1 bg-[#92B4EC]/25 dark:bg-[#1E3E62]/40 rounded-full overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-[#FEA82F] to-[#FF6701] dark:from-[#FF6500] dark:to-[#FEA82F] rounded-full animate-indeterminate" />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Enkripsi AES-256-GCM Terverifikasi</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-lightBg dark:bg-darkBg text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar 
        isSidebarOpen={isSidebarOpen} 
        onToggleSidebar={toggleSidebar} 
      />

      <div className="flex flex-1 relative">
        {/* Responsive & Collapsible Sidebar (Never Auto-Hides) */}
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange} 
          isOpen={isSidebarOpen}
        />

        {/* Main Content Area with Silky-Smooth Page Reveal Animation */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <div
            key={activeTab}
            className="animate-page-reveal"
          >
            {activeTab === 'dashboard' && (
              <DashboardPage onNavigate={handleTabChange} />
            )}
            {activeTab === 'backups' && <BackupsPage />}
            {activeTab === 'apps' && <ApplicationsPage />}
            {activeTab === 'audit' && <AuditLogPage />}
            {activeTab === 'docs' && <DocsPage />}
            {activeTab === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>

      {/* Mobile-first Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};
