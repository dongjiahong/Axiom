import type { ParsedSource, SourceFormat } from "./detect";
import { parseEpub } from "./epub";
import { parseMarkdown } from "./markdown";
import { parsePdf } from "./pdf";
import { parseTxt } from "./text";

export type { ParsedSection, ParsedSource, SourceFormat } from "./detect";
export { assertFormatMatchesContent, detectFormat, fallbackTitle } from "./detect";
export { ParseError } from "./errors";
export { buildChunks, type Chunk } from "./chunk";

/** 按格式分发到对应解析器。 */
export function parseSource(
  format: SourceFormat,
  buffer: Buffer,
  filename: string,
): Promise<ParsedSource> | ParsedSource {
  switch (format) {
    case "epub":
      return parseEpub(buffer, filename);
    case "pdf":
      return parsePdf(buffer, filename);
    case "md":
      return parseMarkdown(buffer, filename);
    case "txt":
      return parseTxt(buffer, filename);
  }
}
