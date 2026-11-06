"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function FieldIcon({ type }: { type: "user" | "lock" | "eye" }) {
  const content =
    type === "user" ? (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ) : type === "lock" ? (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ) : (
      <>
        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {content}
    </svg>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || "Invalid username or password.");
      setLoading(false);
      return;
    }
    router.push("/admin");
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-[#102e58] sm:px-8">
      <section className="w-full max-w-[584px] overflow-hidden rounded-[8px] border border-[#d8e0ea] border-t-[5px] border-t-[#f5b82e] bg-white px-8 py-9 shadow-[0_8px_28px_rgba(16,46,88,.08)] sm:px-9 sm:py-10">
        <div className="flex flex-col items-center">
          <img
            src="/images/logo-blue.png"
            alt="AcutePOS"
            className="h-14 w-[230px] object-contain"
          />
          <h1 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-.03em] text-[#102e58]">
            Admin Login
          </h1>
          <p className="mt-1 text-base text-[#6c819f]">
            Sign in to manage online ordering.
          </p>
        </div>
        <form onSubmit={submit} className="mt-8">
          <label className="block">
            <span className="mb-2 block text-base font-bold text-[#102e58]">
              Username
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b84a4]">
                <FieldIcon type="user" />
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your username"
                className="h-[54px] w-full rounded-[7px] border border-[#cdd9e8] bg-white pl-[58px] pr-4 text-base text-[#102e58] outline-none transition placeholder:text-[#9aacc1] focus:border-[#245b9b] focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </label>
          <label className="mt-6 block">
            <span className="mb-2 block text-base font-bold text-[#102e58]">
              Password
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b84a4]">
                <FieldIcon type="lock" />
              </span>
              <input
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="h-[54px] w-full rounded-[7px] border border-[#cdd9e8] bg-white pl-[58px] pr-14 text-base text-[#102e58] outline-none transition placeholder:text-[#9aacc1] focus:border-[#245b9b] focus:ring-4 focus:ring-blue-50"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b84a4] hover:text-[#245b9b]"
              >
                <FieldIcon type="eye" />
              </button>
            </div>
          </label>
          {error && (
            <p data-notice-tone="error" role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={loading}
            className="mt-6 h-[54px] w-full rounded-[7px] bg-[#205995] text-lg font-bold text-white shadow-sm transition hover:bg-[#174a80] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>
        <div className="mt-7 flex items-center justify-center gap-2 text-base text-[#6b84a4]">
          <FieldIcon type="lock" />
          <span>Secure admin access</span>
        </div>
      </section>
    </main>
  );
}
