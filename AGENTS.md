# Axiom · 执行者须知

## 开始前必读

1. `CONTEXT.md`：领域术语。代码命名、界面文案都必须使用这里的术语（代码标识的映射见 `docs/plan/README.md` §5）。
2. `docs/adr/`：已定的架构决策，不得推翻；确有必要时先提出，不要擅自更改。
3. `docs/plan/`：实现计划。你被分配的工作包在 `docs/plan/work-packages.md` 中，依赖的契约在 `data-model.md`、`llm-and-prompts.md`、`algorithms.md`、`api-and-ui.md` 中。

## 硬性规则

- 使用中文编写界面文案与面向用户的错误信息；代码标识使用英文。
- `src/domain/*` 只放纯函数与类型，不得依赖数据库、Next 或网络。
- 所有 AI 调用必须通过 `runTask()`；不得在 service 或路由中直接调用 SDK。
- 所有返回给客户端的数据必须经过 `src/server/dto/*` 映射。综合测验在复盘前不得泄露目标方法论、备选方法论、对方角色卡、场景设计说明（`data-model.md` §4）。
- 评分、识别、掌握度、证据核对都由代码按 `algorithms.md` 计算，不得改由 AI 直接给出。
- 可调参数只能放在 `src/domain/constants.ts`，不要在代码中写魔法数字。
- API Key 不得写入日志、llm_calls、错误信息或任何接口响应。
- 修改 AI 输出 schema 时，同步修改该任务的 `schemaDescription` 与 `fake()`，并递增 `promptVersion`。

## 命令

```
pnpm dev            # 启动开发服务器
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm e2e            # Playwright（自动使用 AXIOM_FAKE_LLM=1）
pnpm db:reset && pnpm db:seed   # 重置并写入种子数据
```

无 API Key 时设置 `AXIOM_FAKE_LLM=1` 即可开发与测试。

## 交付

每个工作包完成时，`pnpm lint && pnpm typecheck && pnpm test` 必须通过，并在交付说明中写明：完成内容、验证方式、已知限制、对公共契约的任何改动。
