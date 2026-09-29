import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JobRunner } from "@/server/jobs/runner";
import { getJob, listSourceDrafts, startExtraction } from "@/server/services/extraction";
import { getSourceDetail, uploadSource } from "@/server/services/sources";

import { createTestDb, type TestDb } from "../helpers/db";
import { withFakeLLM } from "../helpers/llm";

let test: TestDb;
let uploadsDir: string;
let restore: () => void;

beforeAll(() => {
  restore = withFakeLLM();
  test = createTestDb();
  uploadsDir = mkdtempSync(join(tmpdir(), "axiom-extract-"));
});

afterAll(() => {
  test.close();
  rmSync(uploadsDir, { recursive: true, force: true });
  restore();
});

describe("导入夹具后抽取", () => {
  it.each(["sample.epub", "sample-gbk.txt", "sample.md", "sample.pdf"])("%s：每个章节块都能抽取完成", async (name) => {
    const source = await uploadSource(
      { filename: name, buffer: readFileSync(join(process.cwd(), "tests/fixtures", name)) },
      { database: test.db, uploadsDir },
    );
    const runner = new JobRunner({ database: test.db });
    const job = startExtraction(source.id, { database: test.db, runner });
    await runner.whenIdle();

    expect(getJob(job.id, { database: test.db }).status).toBe("succeeded");
    const detail = getSourceDetail(source.id, test.db);
    expect(detail.status).toBe("extracted");
    expect(detail.chunks.every((c) => c.extractionStatus === "done")).toBe(true);
    // 章节正文不足 200 字的块在 Fake 模式下不产生方法论，其余每块一个 draft
    const expected = detail.chunks.filter((c) => c.charCount >= 200).length;
    expect(listSourceDrafts(source.id, test.db)).toHaveLength(expected);
  });
});
