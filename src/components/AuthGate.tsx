import React, { useEffect, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Props {
  children: (onSignOut: () => void) => ReactNode;
}

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setMessage(error.message);
      setSession(data.session);
      setChecking(false);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setChecking(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (!data.session) {
          setMessage('Account created! Please check your email to confirm your account.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage(error.message || 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setMessage('');

    const debug = (title: string, details: string) => {
      (window as any).__MY_AI_DEBUG_LOG__?.(title, details);
    };

    try {
      debug('GOOGLE LOGIN', 'Starting OAuth URL generation...');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (!data.url) {
        throw new Error('Supabase did not return an OAuth URL.');
      }

      const oauthUrl = new URL(data.url);

      debug('GOOGLE OAUTH URL CHECK',
        'Host: ' + oauthUrl.origin +
        '\nPath: ' + oauthUrl.pathname +
        '\nAPI key parameter exists: ' + oauthUrl.searchParams.has('apikey') +
        '\nAPI key value is non-empty: ' + Boolean(oauthUrl.searchParams.get('apikey')) +
        '\nRedirect target origin: ' +
        (oauthUrl.searchParams.get('redirect_to')
          ? new URL(oauthUrl.searchParams.get('redirect_to')!).origin
          : 'Not provided')
      );

      window.location.assign(data.url);
    } catch (error: any) {
      const safeMessage = String(error?.message || 'Google login failed.')
        .replace(/(apikey|access_token|refresh_token|code)=([^&\s]+)/gi, '$1=[HIDDEN]');

      debug('GOOGLE LOGIN ERROR',
        'Name: ' + (error?.name || 'Unknown') +
        '\nStatus: ' + (error?.status || 'Unknown') +
        '\nCode: ' + (error?.code || 'Unknown') +
        '\nMessage: ' + safeMessage);

      setMessage(safeMessage);
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-300">
        Checking your account...
      </div>
    );
  }

  if (session) {
    return (
      <>
        {children(() => {
          void supabase.auth.signOut();
        })}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl">
        <div className="text-center mb-7">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-3xl mb-4">
            ✦
          </div>
          <h1 className="text-2xl font-bold">My AI Assistant</h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to access your personal AI assistant
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full rounded-xl bg-white text-slate-900 font-semibold py-3 flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <span className="text-xl font-bold">G</span>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px bg-slate-700 flex-1" />
          <span className="text-xs text-slate-500">OR WITH EMAIL</span>
          <div className="h-px bg-slate-700 flex-1" />
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-indigo-500"
          />

          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="Password (minimum 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-indigo-500"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 font-semibold disabled:opacity-50"
          >
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}
          className="w-full mt-5 text-sm text-indigo-300 hover:text-indigo-200"
        >
          {mode === 'login'
            ? "Don't have an account? Create one"
            : 'Already have an account? Sign in'}
        </button>

        {message && (
          <p className="mt-5 p-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-center text-amber-300 break-words">
            {message}
          </p>
        )}

        <p className="text-[10px] text-slate-500 text-center mt-6">
          Your account is protected by Supabase Authentication.
        </p>
      </div>
    </div>
  );
}
