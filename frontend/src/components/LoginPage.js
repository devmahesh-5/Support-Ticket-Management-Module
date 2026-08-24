import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, User, ArrowRight, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid campus credentials or unauthorized account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white antialiased font-sans">
      
      {/* Left/Top Panel: Dark Institutional Branding */}
      <div className="md:w-[40%] flex flex-col justify-between p-8 md:p-16 bg-[#0f1626] border-b md:border-b-0 md:border-r border-slate-800/80 relative overflow-hidden shrink-0">
        {/* Subtle geometric line pattern */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {/* Header - Institution Identity */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-11 h-11 bg-white p-1 rounded-sm shadow-sm flex items-center justify-center">
            <img src="/logo.png" alt="IOE Pulchowk Campus" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Institute of Engineering</p>
            <h1 className="text-sm font-semibold text-white">Pulchowk Campus</h1>
          </div>
        </div>

        {/* Mid section text - Hero message */}
        <div className="my-12 md:my-0 space-y-3 max-w-xs relative z-10">
          <h2 className="text-xl font-light text-white tracking-tight leading-snug">
            Support Desk System
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Central administration and technical ticket infrastructure for Students, Faculty, and Staff.
          </p>
        </div>

        {/* Footer info inside the left layout */}
        <div className="hidden md:block text-[10px] text-slate-500 tracking-wide">
          &copy; {new Date().getFullYear()} IOE Pulchowk.
        </div>
      </div>

      {/* Right/Bottom Panel: Stark White Functional Login Panel */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16 bg-white">
        <div className="w-full max-w-sm space-y-8">
          
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Account Authentication</h3>
            <p className="text-xs text-slate-500">Provide your official campus credentials to access the portal.</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-none">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold tracking-wider uppercase text-slate-500">Campus Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g., pul077bct001"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-none text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-colors duration-150"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold tracking-wider uppercase text-slate-500">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-none text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-colors duration-150"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-medium text-xs rounded-none transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

         

          {/* Mobile only footer */}
          <div className="block md:hidden text-center text-[10px] text-slate-400 pt-4">
            &copy; {new Date().getFullYear()} IOE Pulchowk Campus.
          </div>
        </div>
      </div>

    </div>
  );
}