import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { btnPrimary } from "@/components/page";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Chronicle Studio" },
      { name: "description", content: "Private sign-in for the Chronicle Studio video dashboard." },
      { property: "og:title", content: "Sign in — Chronicle Studio" },
      { property: "og:description", content: "Private sign-in for the Chronicle Studio video dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ to: "/", replace: true }); });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError("Wrong email or password."); return; }
    void navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Lock className="h-4 w-4" /></span>
          <div>
            <h1 className="text-lg font-semibold">Chronicle Studio</h1>
            <p className="text-xs text-muted-foreground">Private dashboard — owner sign-in only</p>
          </div>
        </div>
        <label className="mb-1 block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <label className="mb-1 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full justify-center`}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
