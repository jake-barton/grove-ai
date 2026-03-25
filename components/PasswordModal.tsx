'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Lock, X, Eye, EyeOff } from 'lucide-react';

interface PasswordModalProps {
  onSuccess: () => void;
  onDismiss: () => void;
}

export default function PasswordModal({ onSuccess, onDismiss }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async () => {
    if (!password.trim()) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        setError('Incorrect password');
        setPassword('');
        triggerShake();
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection error. Please try again.');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div
        className={`relative w-full max-w-sm mx-4 rounded-2xl p-8 shadow-2xl transition-transform ${shake ? 'animate-shake' : ''}`}
        style={{
          background: 'var(--bg-surface, #1a1a2e)',
          border: '1px solid var(--border-mid, rgba(255,255,255,0.1))',
        }}
      >
        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-muted, #888)' }}
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        {/* Lock icon */}
        <div className="flex justify-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-purple, rgba(139,92,246,0.15))' }}
          >
            <Lock size={24} style={{ color: 'var(--accent-purple-solid, #8b5cf6)' }} />
          </div>
        </div>

        {/* Title */}
        <h2
          className="text-center text-xl font-semibold mb-1"
          style={{ fontFamily: 'var(--font-sora)', color: 'var(--text-primary, #fff)' }}
        >
          Team Access Required
        </h2>
        <p
          className="text-center text-sm mb-6"
          style={{ color: 'var(--text-muted, #888)' }}
        >
          Enter the Grove password to make changes
        </p>

        {/* Password input */}
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Password"
            className="w-full rounded-xl px-4 py-3 pr-12 text-sm outline-none transition-all"
            style={{
              background: 'var(--bg-base, #0f0f1a)',
              border: error
                ? '1px solid var(--error, #ef4444)'
                : '1px solid var(--border-mid, rgba(255,255,255,0.1))',
              color: 'var(--text-primary, #fff)',
              fontFamily: 'var(--font-source-sans)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-muted, #888)' }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm mb-4 text-center" style={{ color: 'var(--error, #ef4444)' }}>
            {error}
          </p>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !password.trim()}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: 'var(--accent-purple-solid, #8b5cf6)',
            color: '#fff',
            fontFamily: 'var(--font-sora)',
          }}
        >
          {isLoading ? 'Verifying…' : 'Unlock'}
        </button>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.45s ease-in-out;
        }
      `}</style>
    </div>
  );
}
