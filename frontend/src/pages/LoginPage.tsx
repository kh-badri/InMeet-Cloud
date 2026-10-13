import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Cloud, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, verify2FA } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFATicket, setTwoFATicket] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.requires_2fa && res.ticket) {
        setTwoFATicket(res.ticket);
      }
    } catch (err: any) {
      setError(err.message || 'Login gagal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFATicket) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await verify2FA(twoFATicket, twoFACode);
    } catch (err: any) {
      setError(err.message || 'Verifikasi 2FA gagal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-lightBg dark:bg-darkBg selection:bg-[#FF6701] dark:selection:bg-[#FF6500] selection:text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#92B4EC]/70 bg-white p-8 sm:p-10 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C]">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FF6701] text-white font-bold shadow-sm dark:bg-[#FF6500] dark:text-black mb-3">
            <Cloud className="h-6 w-6" />
          </div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              InMeet
            </h1>
            <span className="text-2xl font-black tracking-tight text-[#FF6701] dark:text-[#FF6500]">
              Cloud
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Cloud Penyimpanan Cadangan Terenkripsi
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#92B4EC]/60 bg-[#92B4EC]/15 px-3 py-1 text-[10px] font-bold text-slate-700 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Vault Security Protocol • v2.4</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {!twoFATicket ? (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Alamat Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@backupvault.local"
                  className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-colors duration-150 focus:border-[#FF6701] focus:ring-1 focus:ring-[#FF6701] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-colors duration-150 focus:border-[#FF6701] focus:ring-1 focus:ring-[#FF6701] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors duration-150 shadow-sm active:scale-[0.99] disabled:opacity-50 dark:bg-[#FF6500] dark:text-black dark:hover:bg-[#FEA82F]"
            >
              {isSubmitting ? 'Memproses...' : 'Masuk ke Sistem'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleStep2} className="space-y-4">
            <div className="rounded-xl border border-[#FEA82F]/60 bg-[#FEA82F]/10 p-4 dark:border-[#FF6500]/40 dark:bg-[#000000]">
              <div className="flex items-center gap-2 text-[#FF6701] dark:text-[#FF6500] text-xs font-bold mb-1">
                <KeyRound className="h-4 w-4" />
                Verifikasi Dua Langkah (2FA) Wajib
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {isRecoveryCode
                  ? 'Masukkan salah satu kode pemulihan (recovery code) cadangan Anda.'
                  : 'Buka aplikasi authenticator Anda dan masukkan 6 digit kode keamanan.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRecoveryCode ? 'Kode Pemulihan' : 'Kode TOTP (6 Angka)'}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                placeholder={isRecoveryCode ? 'XXXXX-XXXXX' : '123456'}
                className="w-full text-center tracking-widest font-mono text-base font-bold rounded-xl border border-[#92B4EC]/80 bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition-colors duration-150 focus:border-[#FF6701] focus:ring-1 focus:ring-[#FF6701] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors duration-150 shadow-sm active:scale-[0.99] disabled:opacity-50 dark:bg-[#FF6500] dark:text-black dark:hover:bg-[#FEA82F]"
            >
              {isSubmitting ? 'Memverifikasi...' : 'Verifikasi & Lanjutkan'}
            </button>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setIsRecoveryCode(!isRecoveryCode)}
                className="text-xs font-semibold text-[#FF6701] dark:text-[#FF6500] hover:underline"
              >
                {isRecoveryCode ? 'Gunakan Kode TOTP' : 'Gunakan Kode Pemulihan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFATicket(null);
                  setTwoFACode('');
                }}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
