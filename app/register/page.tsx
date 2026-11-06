'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authPagePath, checkoutReturnPath, storePath } from '../../lib/checkout-auth';
import { useStore } from '../../components/StoreProvider';

const inputClassName =
  'mt-2 w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-700/10';
const labelClassName = 'block text-sm font-medium text-stone-700';

export default function RegisterPage() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const returnPath = checkoutReturnPath(params.get('next'));
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'success'>('error');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | 'register' | null>(null);
  const emailVerified = verifiedEmail === email.trim().toLowerCase() && verifiedEmail !== '';

  async function requestVerificationCode() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice('Enter a valid email address before requesting a code.');
      return;
    }
    setBusy('send');
    setNotice('');
    setNoticeTone('error');
    setVerifiedEmail('');
    try {
      const response = await store.storeFetch('/api/auth/email-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: normalizedEmail }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to send the verification code.');
      setNoticeTone('success');
      setNotice(result.message || 'Verification code sent. Check your email.');
    } catch (error) {
      setNoticeTone('error');
      setNotice(error instanceof Error ? error.message : 'Unable to send the verification code.');
    } finally {
      setBusy(null);
    }
  }

  async function verifyEmailCode() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice('Enter a valid email address before verifying your code.');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setNotice('Enter the six-digit verification code from your email.');
      return;
    }
    setBusy('verify');
    setNotice('');
    setNoticeTone('error');
    try {
      const response = await store.storeFetch('/api/auth/email-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: normalizedEmail, code: verificationCode }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to verify the code.');
      setVerifiedEmail(normalizedEmail);
      setNoticeTone('success');
      setNotice(result.message || 'Email address verified.');
    } catch (error) {
      setVerifiedEmail('');
      setNoticeTone('error');
      setNotice(error instanceof Error ? error.message : 'Unable to verify the code.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (password !== confirmPassword) {
      setNoticeTone('error');
      setNotice('Passwords do not match. Please check both password fields.');
      return;
    }
    if (!emailVerified) {
      setNoticeTone('error');
      setNotice('Verify your email address before creating an account.');
      return;
    }
    setBusy('register');
    setNotice('');
    try {
      const response = await store.storeFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: String(form.get('firstName') ?? ''),
          lastName: String(form.get('lastName') ?? ''),
          phoneNumber: String(form.get('phoneNumber') ?? ''),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
        }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to create the account.');
      setNoticeTone('success');
      setNotice(result.message || 'Account created. You are now signed in.');
      router.replace(storePath(returnPath,store.storeCode));
    } catch (error) {
      setNoticeTone('error');
      setNotice(error instanceof Error ? error.message : 'Unable to create the account.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl items-center justify-center px-5 py-10 sm:py-14">
      <section className="w-full rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-9">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Join {store.data.store.name}</p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">Create your account</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Enter your details below to get started.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClassName}>
              First name
              <input
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={100}
                required
                placeholder="First name"
                className={inputClassName}
              />
            </label>
            <label className={labelClassName}>
              Last name
              <input
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={100}
                required
                placeholder="Last name"
                className={inputClassName}
              />
            </label>
          </div>

          <label className={labelClassName}>
            Phone number
            <input
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              maxLength={20}
              required
              placeholder="Enter your phone number"
              className={inputClassName}
            />
          </label>

          <div>
            <label htmlFor="register-email" className={labelClassName}>Email address</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={255}
                required
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (event.target.value.trim().toLowerCase() !== verifiedEmail) setVerifiedEmail('');
                }}
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-700/10"
              />
              <button
                type="button"
                onClick={requestVerificationCode}
                disabled={busy !== null}
                className="shrink-0 rounded-lg border border-red-700 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                {busy === 'send' ? 'Sending…' : 'Send code'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="verificationCode" className={labelClassName}>Email verification code</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="verificationCode"
                name="verificationCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                pattern="[0-9]{6}"
                required
                placeholder="Enter 6-digit code"
                aria-describedby="verification-help"
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm tracking-[0.2em] text-stone-900 outline-none transition placeholder:tracking-normal placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-700/10"
              />
              <button
                type="button"
                onClick={verifyEmailCode}
                disabled={busy !== null}
                className={`shrink-0 rounded-lg px-5 py-3 text-sm font-semibold transition ${
                  emailVerified
                    ? 'bg-green-50 text-green-800 hover:bg-green-50'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {busy === 'verify' ? 'Verifying…' : emailVerified ? 'Verified' : 'Verify code'}
              </button>
            </div>
            <p
              id="verification-help"
              className={`mt-2 text-xs leading-5 ${emailVerified ? 'font-medium text-green-700' : 'text-stone-500'}`}
            >
              {emailVerified
                ? 'Email address verified.'
                : 'The code expires in 10 minutes. You can request another code after one minute.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClassName}>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                className={inputClassName}
              />
            </label>
            <label className={labelClassName}>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Enter password again"
                className={inputClassName}
              />
            </label>
          </div>

          {notice && (
            <p
              data-notice-tone={noticeTone} role={noticeTone === 'error' ? 'alert' : 'status'}
              className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
                noticeTone === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="w-full rounded-lg bg-red-800 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
          >
            {busy === 'register' ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          Already registered?{' '}
          <Link href={authPagePath('/login',returnPath,store.storeCode)} className="font-semibold text-red-700 hover:text-red-900">Log in</Link>
        </p>
      </section>
    </main>
  );
}
