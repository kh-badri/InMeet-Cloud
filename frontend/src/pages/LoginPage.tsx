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
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50 dark:bg-darkBg">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold shadow-sm mb-3">
            <Cloud className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            InMeet Cloud
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cloud Penyimpanan Cadangan Terenkripsi
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {!twoFATicket ? (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Alamat Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@backupvault.local"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Memproses...' : 'Masuk ke Sistem'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleStep2} className="space-y-4">
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/10">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold mb-1">
                <KeyRound className="h-4 w-4" />
                Verifikasi Dua Langkah (2FA) Wajib
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {isRecoveryCode
                  ? 'Masukkan salah satu kode pemulihan (recovery code) cadangan Anda.'
                  : 'Buka aplikasi authenticator Anda dan masukkan 6 digit kode keamanan.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRecoveryCode ? 'Kode Pemulihan' : 'Kode TOTP (6 Angka)'}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                placeholder={isRecoveryCode ? 'XXXXX-XXXXX' : '123456'}
                className="w-full text-center tracking-widest font-mono text-lg rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Memverifikasi...' : 'Verifikasi & Lanjutkan'}
            </button>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setIsRecoveryCode(!isRecoveryCode)}
                className="text-xs text-indigo-600 dark:text-cyan-400 hover:underline"
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
