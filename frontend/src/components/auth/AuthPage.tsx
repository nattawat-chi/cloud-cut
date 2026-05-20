import { useState } from "react";

import { useAuthStore } from "@/state/authStore";

type Mode = "login" | "register";

/**
 * Login + Register page. Rendered when no JWT is in `authStore`.
 * On success the App switches to the editor automatically (App.tsx checks
 * `selectIsAuthenticated`).
 */
export function AuthPage(): React.ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("alice@cloudcut.dev");
  const [password, setPassword] = useState("password123");
  const [displayName, setDisplayName] = useState("");

  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, displayName || email.split("@")[0]!);
    } catch {
      // authStore captured the message into `error` already
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 text-text-1 p-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-3 bg-surface-1 p-6 shadow-xl">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-6">
          <div className="size-7 rounded-md bg-primary grid place-items-center text-surface-0 font-bold">
            ☁
          </div>
          <h1 className="text-lg font-semibold tracking-tight">CloudCut</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-md bg-surface-2 ">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`cursor-pointer flex-1 text-sm py-1.5 rounded ${
              mode === "login"
                ? "bg-surface-1 text-text-1"
                : "text-text-3 hover:text-text-2"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`cursor-pointer flex-1 text-sm py-1.5 rounded ${
              mode === "register"
                ? "bg-surface-1 text-text-1"
                : "text-text-3 hover:text-text-2"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="block text-xs text-text-3 mb-1">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-1"
              placeholder="you@example.com"
            />
          </label>

          {mode === "register" && (
            <label className="block">
              <span className="block text-xs text-text-3 mb-1">
                Display name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-1"
                placeholder="Your name"
              />
            </label>
          )}

          <label className="block">
            <span className="block text-xs text-text-3 mb-1">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-1"
            />
          </label>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/80 disabled:opacity-50 text-surface-0 font-medium text-sm py-2 rounded transition-colors cursor-pointer"
          >
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-xs text-text-4 text-center">
          {mode === "login" ? "Seed account: " : ""}
          {mode === "login" && (
            <code className="text-text-3">
              alice@cloudcut.dev / password123
            </code>
          )}
        </p>
      </div>
    </div>
  );
}
