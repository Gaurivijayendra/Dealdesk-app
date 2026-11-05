import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useLogin, getGetSessionQueryKey } from '@workspace/api-client-react';
import { Logo, Footer } from '@/components/shell';
import { MarginMeter } from '@/components/margin-meter';
import { errMsg } from '@/lib/dd';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { email, password } }, {
      onSuccess: (s) => {
        qc.clear();
        qc.setQueryData(getGetSessionQueryKey(), s);
        setLocation('/quotes');
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-surface">
      <div className="flex-1 grid lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden lg:flex flex-col justify-between p-14 border-r border-line bg-white">
          <Logo className="text-xl" />
          <div className="max-w-lg">
            <h1 className="text-5xl font-semibold leading-[1.05] text-ink">AI writes the deal.<br /><span className="text-ok">Rules and people protect the margin.</span></h1>
            <p className="mt-6 text-sub text-lg">Your reps draft quotes with Claude. DealDesk checks every rupee against your floors, routes the exceptions to the right approver, and keeps a clean record.</p>
            <div className="mt-12 paper rounded-md p-6">
              <div className="flex justify-between text-sm mb-4"><span className="font-display font-semibold">Q-1042 · Kaveri Logistics</span><span className="text-warn">Pending · Sales Head</span></div>
              <MarginMeter listTotal={540000} floorTotal={405000} effective={18} original={25} approved={null} bands={[{ maxDiscount: 10, approver: 'Rep' }, { maxDiscount: 20, approver: 'Sales Head' }, { maxDiscount: 100, approver: 'Founder' }]} />
              <p className="text-xs text-sub mt-3">Illustration only — Simulated demo data.</p>
            </div>
          </div>
          <p className="text-sm text-sub">Built for 5–50 person B2B sales teams in India.</p>
        </section>

        <section className="flex items-center justify-center p-6">
          <form onSubmit={submit} className="w-full max-w-sm" aria-labelledby="login-title">
            <Logo className="text-xl lg:hidden mb-10" />
            <h2 id="login-title" className="text-3xl font-semibold text-ink">Sign in</h2>
            <p className="text-sub mt-1">Pick up where your approvals left off.</p>
            <div className="mt-8 space-y-4">
              <label className="block"><span className="text-sm font-medium text-ink">Work email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2.5 focus:border-ok" data-testid="input-email" /></label>
              <label className="block"><span className="text-sm font-medium text-ink">Password</span>
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2.5 focus:border-ok" data-testid="input-password" /></label>
            </div>
            {login.isError && <p role="alert" className="mt-4 text-sm text-bad" data-testid="text-login-error">{errMsg(login.error)}</p>}
            <button type="submit" disabled={login.isPending} className="mt-6 w-full rounded-md bg-ok text-white py-2.5 font-semibold hover:bg-[#0c6a52] disabled:opacity-60" data-testid="button-login">
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="mt-8 rounded-md border border-line bg-white p-4 text-sm">
              <div className="font-medium text-ink">Demo credentials</div>
              <div className="mt-1 text-sub tnum">demo@dealdesk.app / dealdesk2026</div>
              <button type="button" onClick={() => { setEmail('demo@dealdesk.app'); setPassword('dealdesk2026'); }} className="mt-2 text-ok hover:underline" data-testid="button-fill-demo">Fill demo credentials</button>
            </div>
          </form>
        </section>
      </div>
      <Footer />
    </div>
  );
}
