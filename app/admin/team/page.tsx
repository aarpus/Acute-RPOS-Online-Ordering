'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';

type Member = { id: string; email: string; role: 'admin' | 'super_admin'; createdAt: string };
const inputClass = 'mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-[#152033]';

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [canAssignSuperAdmin, setCanAssignSuperAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Member['role']>('admin');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/admin/team', { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as { data: Member[]; canAssignSuperAdmin: boolean; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load team accounts.');
        setMembers(body.data); setCanAssignSuperAdmin(body.canAssignSuperAdmin === true); setAllowed(true);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load team accounts.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, []);
  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, role: canAssignSuperAdmin ? role : 'admin' }) });
      const body = await response.json() as { data: Member; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to create team login.');
      setMembers(previous => [...previous, body.data]); setEmail(''); setPassword(''); setRole('admin');
      setNotice(`Login created for ${body.data.email}. They can sign in at /admin/login using the password you set.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create team login.'); }
    finally { setSaving(false); }
  }
  async function signOut() { await fetch('/api/admin/logout', { method: 'POST' }); router.replace('/admin/login'); }
  return <AdminShell active="Team" pageTitle="Team" pageSubtitle="Create separate logins for your admin team." onSignOut={signOut}>
    <div className="space-y-5 p-5 sm:p-8">
      {loading && <p role="status" className="text-sm text-slate-500">Loading team accounts…</p>}
      {error && <p role="alert" data-notice-tone="error" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" data-notice-tone="success" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
      {allowed && <>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-[#183f70]">Create Team Login</h2>
          <p className="mt-2 text-xs text-slate-500">Each member signs in with their own email and password and has access to your company’s admin panel.</p>
          <form onSubmit={createMember} className="mt-5 space-y-4">
            <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
              <label className="text-xs font-bold text-[#183f70]">Email Address<input type="email" required maxLength={255} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} className={inputClass} /></label>
              <label className="text-xs font-bold text-[#183f70]">Password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} /><span className="mt-1 block font-normal text-slate-500">Use 8–128 characters.</span></label>
              <label className="text-xs font-bold text-[#183f70]">Role<select value={role} onChange={event => setRole(event.target.value as Member['role'])} className={inputClass}><option value="admin">Admin</option>{canAssignSuperAdmin && <option value="super_admin">Super Admin</option>}</select></label>
              <p className="self-center text-xs leading-5 text-slate-500">{canAssignSuperAdmin ? 'Admins can use the admin panel and create team logins. Super Admins can also assign roles and manage menu visibility.' : 'Create Admin logins for your team. Each member can use your company’s admin panel and create other Admin logins.'}</p>
            </fieldset>
            <div className="flex justify-end border-t border-slate-100 pt-4"><button type="submit" disabled={saving} className="rounded-lg bg-[#183f70] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create Login'}</button></div>
          </form>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold text-[#183f70]">Team Accounts ({members.length})</h2>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Created</th></tr></thead><tbody>{members.map(member => <tr key={member.id} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold text-[#183f70]">{member.email}</td><td className="px-5 py-4">{member.role === 'super_admin' ? 'Super Admin' : 'Admin'}</td><td className="px-5 py-4 text-slate-500">{new Date(member.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </div>
  </AdminShell>;
}
