"use client";

import { useState } from "react";

import { Logo } from "@/components/common/logo";
import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** 门禁口令输入。通过后整页跳转，保证带着新 Cookie 重新加载。 */
export function GateForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center gap-3">
        <Logo />
        <CardTitle className="text-lg">请输入访问口令</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="访问口令"
            aria-label="访问口令"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !password.trim()}>
            {busy ? "验证中……" : "进入"}
          </Button>
          <p className="text-muted-foreground text-xs">验证通过后 7 天内无需再次输入。</p>
        </form>
      </CardContent>
    </Card>
  );
}
