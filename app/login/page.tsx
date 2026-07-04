"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/Toaster";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function signIn() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showToast(error.message, "error"); setLoading(false); return; }
    router.push("/home");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <p className="text-[#00FF85] text-4xl font-black mb-1">FlowLedger</p>
        <p className="text-[#6b7280] text-sm">Personal finance tracker</p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <Input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-[#111111] border-white/10 text-white h-12" />
        <Input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
          className="bg-[#111111] border-white/10 text-white h-12" />
        <Button onClick={signIn} disabled={loading}
          className="w-full h-12 bg-[#00FF85] text-black font-bold rounded-2xl">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </div>
    </div>
  );
}
