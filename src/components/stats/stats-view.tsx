"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DIFFICULTY_LABELS } from "@/components/practice/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Difficulty } from "@/domain/schemas";
import type {
  ConfusionRowDto,
  MethodologyOverviewDto,
  StatsDifficultyDto,
} from "@/server/dto/stats";

import {
  DIFFICULTY_ORDER,
  formatDate,
  formatMastery,
  formatPercent,
  formatScore,
  OUTCOME_ORDER,
  OUTCOME_SHORT_LABELS,
} from "./labels";

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  cooperative: "#059669",
  neutral: "#d97706",
  tough: "#dc2626",
};

export interface StatsViewProps {
  overview: MethodologyOverviewDto[];
  confusion: ConfusionRowDto[];
  difficulty: StatsDifficultyDto;
  filtered: boolean;
}

// ───────────── 图表 ─────────────

interface TrendPoint {
  endedAt: number;
  executionScore: number;
  difficulty: Difficulty;
  hintUsed: boolean;
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[0, 100]} hide />
          <XAxis dataKey="endedAt" hide />
          <Line
            type="monotone"
            dataKey="executionScore"
            stroke="#64748b"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 折线点按难度着色；查看过提示的点用空心表示（api-and-ui.md §4.11）。 */
function TrendDot(props: { cx?: number; cy?: number; payload?: TrendPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.hintUsed ? "#ffffff" : DIFFICULTY_COLORS[payload.difficulty]}
      stroke={DIFFICULTY_COLORS[payload.difficulty]}
      strokeWidth={2}
    />
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((point, index) => ({ ...point, index }));
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="index" tickFormatter={() => ""} tick={false} />
          <YAxis domain={[0, 100]} width={32} />
          <Tooltip
            formatter={(value) => [`${value} 分`, "执行分"]}
            labelFormatter={(label) => formatDate(data[Number(label)]?.endedAt ?? null)}
          />
          <Line
            type="monotone"
            dataKey="executionScore"
            stroke="#94a3b8"
            strokeWidth={1.5}
            dot={<TrendDot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DifficultyBars({ difficulty }: { difficulty: StatsDifficultyDto }) {
  const data = DIFFICULTY_ORDER.map((key) => ({
    difficulty: key,
    label: DIFFICULTY_LABELS[key],
    execAvg: difficulty.overall[key].execAvg ?? 0,
    n: difficulty.overall[key].n,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" />
          <YAxis domain={[0, 100]} width={32} />
          <Tooltip formatter={(value) => [`${value} 分`, "执行分均值"]} />
          <Bar dataKey="execAvg" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.difficulty} fill={DIFFICULTY_COLORS[entry.difficulty]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────── 概览 ─────────────

function OverviewTable({ rows, filtered }: { rows: MethodologyOverviewDto[]; filtered: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {filtered ? "当前筛选条件下没有可统计的方法论。" : "方法论库里还没有可统计的方法论。"}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>方法论</TableHead>
          <TableHead>标签</TableHead>
          <TableHead className="text-right">专项 / 测验</TableHead>
          <TableHead className="text-right">全部均值</TableHead>
          <TableHead className="text-right">最近 5 场</TableHead>
          <TableHead className="text-right">看过 / 未看提示</TableHead>
          <TableHead className="text-right">识别正确率</TableHead>
          <TableHead className="text-right">掌握度</TableHead>
          <TableHead className="text-right">最近练习</TableHead>
          <TableHead>趋势</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.methodologyId}>
            <TableRow
              className="cursor-pointer"
              onClick={() =>
                setExpanded((current) => (current === row.methodologyId ? null : row.methodologyId))
              }
            >
              <TableCell className="font-medium">
                {row.name}
                {row.status === "archived" ? (
                  <Badge variant="outline" className="ml-2">
                    已归档
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.tags.join("、") || "—"}</TableCell>
              <TableCell className="text-right">
                {row.drillCount} / {row.quizCount}
              </TableCell>
              <TableCell className="text-right">{formatScore(row.execAvgAll)}</TableCell>
              <TableCell className="text-right">{formatScore(row.execAvgRecent)}</TableCell>
              <TableCell className="text-right">
                {formatScore(row.execAvgWithHint)} / {formatScore(row.execAvgWithoutHint)}
              </TableCell>
              <TableCell className="text-right">
                {row.recognitionAccuracy === null
                  ? "—"
                  : `${formatPercent(row.recognitionAccuracy)}（${row.recognitionN}）`}
              </TableCell>
              <TableCell className="text-right">{formatMastery(row.mastery)}</TableCell>
              <TableCell className="text-right">{formatDate(row.lastPracticedAt)}</TableCell>
              <TableCell>
                <Sparkline points={row.execTrend} />
              </TableCell>
            </TableRow>
            {expanded === row.methodologyId ? (
              <TableRow>
                <TableCell colSpan={10} className="bg-muted/30">
                  {row.execTrend.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-center text-sm">
                      还没有练习记录。
                    </p>
                  ) : (
                    <div className="space-y-2 py-2">
                      <TrendChart points={row.execTrend} />
                      <div className="flex flex-wrap gap-3 text-xs">
                        {DIFFICULTY_ORDER.map((key) => (
                          <span key={key} className="flex items-center gap-1">
                            <span
                              className="inline-block size-2.5 rounded-full"
                              style={{ backgroundColor: DIFFICULTY_COLORS[key] }}
                            />
                            {DIFFICULTY_LABELS[key]}
                          </span>
                        ))}
                        <span className="text-muted-foreground flex items-center gap-1">
                          <span className="inline-block size-2.5 rounded-full border-2 bg-white" />
                          空心表示查看过提示
                        </span>
                      </div>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

// ───────────── 识别混淆 ─────────────

function ConfusionList({ rows }: { rows: ConfusionRowDto[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        完成综合测验后这里会显示你容易混淆的方法论。
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={`${row.targetId}-${row.selectedId}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
        >
          <span className="font-medium">{row.targetName}</span>
          <span className="text-muted-foreground">→ 误选</span>
          <span className="font-medium">{row.selectedName}</span>
          <span className="text-muted-foreground text-xs">：错误 {row.wrongCount} 次</span>
          <span className="text-muted-foreground text-xs">/ 部分正确 {row.partialCount} 次</span>
          <Link
            href={`/library/compare?a=${row.targetId}&b=${row.selectedId}`}
            className="ml-auto underline"
          >
            对比
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ───────────── 难度分层 ─────────────

function DifficultyView({ data }: { data: StatsDifficultyDto }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>各难度执行分均值</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {DIFFICULTY_ORDER.every((key) => data.overall[key].n === 0) ? (
            <p className="text-muted-foreground text-sm">还没有练习记录。</p>
          ) : (
            <DifficultyBars difficulty={data} />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>难度</TableHead>
                <TableHead className="text-right">场数</TableHead>
                <TableHead className="text-right">执行分均值</TableHead>
                {OUTCOME_ORDER.map((outcome) => (
                  <TableHead key={outcome} className="text-right">
                    {OUTCOME_SHORT_LABELS[outcome]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {DIFFICULTY_ORDER.map((key) => {
                const bucket = data.overall[key];
                return (
                  <TableRow key={key}>
                    <TableCell>{DIFFICULTY_LABELS[key]}</TableCell>
                    <TableCell className="text-right">{bucket.n}</TableCell>
                    <TableCell className="text-right">{formatScore(bucket.execAvg)}</TableCell>
                    {OUTCOME_ORDER.map((outcome) => (
                      <TableCell key={outcome} className="text-right">
                        {bucket.outcomeDistribution[outcome]}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>按方法论</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byMethodology.length === 0 ? (
            <p className="text-muted-foreground text-sm">还没有可统计的方法论。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>方法论</TableHead>
                  {DIFFICULTY_ORDER.map((key) => (
                    <TableHead key={key} className="text-right">
                      {DIFFICULTY_LABELS[key]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byMethodology.map((row) => {
                  const highlighted = data.largestGap?.methodologyId === row.methodologyId;
                  return (
                    <TableRow key={row.methodologyId} className={highlighted ? "bg-amber-50" : undefined}>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.status === "archived" ? (
                          <Badge variant="outline" className="ml-2">
                            已归档
                          </Badge>
                        ) : null}
                        {highlighted ? (
                          <Badge variant="secondary" className="ml-2">
                            高低档差 {data.largestGap?.gap}
                          </Badge>
                        ) : null}
                      </TableCell>
                      {DIFFICULTY_ORDER.map((key) => {
                        const bucket = row.byDifficulty[key];
                        return (
                          <TableCell key={key} className="text-right">
                            {bucket === null ? "—" : `${bucket.execAvg}（${bucket.n}）`}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────── 页面主体 ─────────────

export function StatsView({ overview, confusion, difficulty, filtered }: StatsViewProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">方法论概览</TabsTrigger>
        <TabsTrigger value="confusion">识别混淆</TabsTrigger>
        <TabsTrigger value="difficulty">难度分层</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewTable rows={overview} filtered={filtered} />
      </TabsContent>
      <TabsContent value="confusion">
        <ConfusionList rows={confusion} />
      </TabsContent>
      <TabsContent value="difficulty">
        <DifficultyView data={difficulty} />
      </TabsContent>
    </Tabs>
  );
}
