"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_TURNS_MAX, MAX_TURNS_MIN } from "@/domain/constants";
import type { SettingsDto } from "@/server/dto/settings";

interface TestResult {
  latencyMs: number;
  supportsJsonMode: boolean;
  supportsTemperature: boolean;
  sample: string;
}

async function request<T>(url: string, method: "PUT" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "请求失败");
  return data as T;
}

export function SettingsForm({ initial, dataDir }: { initial: SettingsDto; dataDir: string }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initial.llm.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.llm.model);
  const [maxTurns, setMaxTurns] = useState(String(initial.practice.maxTurns));
  const [busy, setBusy] = useState<"save" | "test" | "practice" | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function saveLLM(): Promise<boolean> {
    try {
      await request("/api/settings/llm", "PUT", { baseUrl, apiKey: apiKey || undefined, model });
      setApiKey("");
      setTestResult(null);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
      return false;
    }
  }

  async function handleSave() {
    setBusy("save");
    if (await saveLLM()) toast.success("AI 设置已保存");
    setBusy(null);
  }

  async function handleTest() {
    setBusy("test");
    setTestError(null);
    setTestResult(null);
    if (await saveLLM()) {
      try {
        setTestResult(await request<TestResult>("/api/settings/llm/test", "POST"));
        router.refresh();
      } catch (err) {
        setTestError(err instanceof Error ? err.message : "测试失败");
      }
    }
    setBusy(null);
  }

  async function handlePracticeSave() {
    setBusy("practice");
    try {
      await request("/api/settings/practice", "PUT", { maxTurns: Number(maxTurns) });
      toast.success("练习设置已保存");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI 模型</CardTitle>
          <CardDescription>
            任意 OpenAI 兼容端点；抽取、角色扮演和复盘共用同一个模型。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initial.llm.overriddenByEnv ? (
            <Alert>
              <AlertDescription>
                已被环境变量（AXIOM_LLM_*）覆盖：此处保存的值不会生效，实际使用环境变量中的配置。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              placeholder={initial.llm.apiKeyMasked || "sk-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {initial.llm.apiKeyMasked ? `当前：${initial.llm.apiKeyMasked}，留空表示不修改。` : "尚未设置。"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">模型名</Label>
            <Input
              id="model"
              placeholder="gpt-4o"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={busy !== null}>
              {busy === "save" ? "保存中……" : "保存"}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={busy !== null}>
              {busy === "test" ? "测试中……" : "测试连接"}
            </Button>
          </div>
          {testError ? (
            <Alert variant="destructive">
              <AlertDescription>连接失败：{testError}</AlertDescription>
            </Alert>
          ) : null}
          {testResult ? (
            <Alert>
              <AlertDescription className="space-y-2">
                <p>连接成功，延迟 {testResult.latencyMs} 毫秒。</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={testResult.supportsJsonMode ? "default" : "secondary"}>
                    JSON 模式：{testResult.supportsJsonMode ? "支持" : "不支持"}
                  </Badge>
                  <Badge variant={testResult.supportsTemperature ? "default" : "secondary"}>
                    temperature：{testResult.supportsTemperature ? "支持" : "不支持"}
                  </Badge>
                </div>
                <p>示例回复：{testResult.sample}</p>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>练习</CardTitle>
          <CardDescription>新建的练习会使用这里的轮数上限。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxTurns">轮数上限（{MAX_TURNS_MIN}–{MAX_TURNS_MAX}）</Label>
            <Input
              id="maxTurns"
              type="number"
              min={MAX_TURNS_MIN}
              max={MAX_TURNS_MAX}
              className="w-32"
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
            />
          </div>
          <Button onClick={handlePracticeSave} disabled={busy !== null}>
            {busy === "practice" ? "保存中……" : "保存"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>数据存放目录：<code>{dataDir}</code></p>
          <p>API Key 以明文保存在本机数据库中，界面和接口只显示掩码。</p>
        </CardContent>
      </Card>
    </div>
  );
}
