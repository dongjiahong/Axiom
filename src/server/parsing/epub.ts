import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

import { fallbackTitle, type ParsedSection, type ParsedSource } from "./detect";
import { ParseError } from "./errors";

/**
 * epub 解析。
 * 目录取 EPUB3 nav.xhtml，其次 EPUB2 toc.ncx，只保留顶层与第二层条目。
 */

const XML_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  isArray: (name: string) => ["rootfile", "item", "itemref", "navPoint"].includes(name),
};

/** 段落级标签：内容结束即换行。 */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "br",
  "hr",
  "blockquote",
  "pre",
  "figure",
  "figcaption",
  "dd",
  "dt",
  "td",
  "th",
  "tr",
  "table",
  "ul",
  "ol",
]);

/** domhandler 节点的最小结构（避免直接依赖它的类型）。 */
interface DomNode {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

export interface TocEntry {
  title: string;
  /** zip 内的文件路径。 */
  file: string;
  anchor: string | null;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** XML 元素的文本：可能是字符串，也可能带属性（`#text`）。 */
function xmlText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as Record<string, unknown>)["#text"];
    if (typeof text === "string") return text.trim() || null;
    if (typeof text === "number") return String(text);
  }
  return null;
}

function posixDir(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function resolveZipPath(baseDir: string, href: string): string {
  const raw = href.split("#")[0].split("?")[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (decoded.startsWith("/")) return decoded.slice(1);
  const parts = (baseDir ? `${baseDir}/${decoded}` : decoded).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function splitHref(href: string): { path: string; anchor: string | null } {
  const index = href.indexOf("#");
  if (index < 0) return { path: href, anchor: null };
  return { path: href.slice(0, index), anchor: href.slice(index + 1) || null };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readZipFile(zip: JSZip, path: string): Promise<string | null> {
  let file = zip.file(path);
  if (!file && path) {
    const matches = zip.file(new RegExp(`^${escapeRegExp(path)}$`, "i"));
    if (matches.length > 0) file = matches[0];
  }
  if (!file) return null;
  return file.async("string");
}

interface HtmlText {
  lines: string[];
  /** 锚点 id → 该锚点内容所在的行号。 */
  anchorLines: Map<string, number>;
  /** 文档中第一个 h1–h3 的文本。 */
  heading: string | null;
}

function extractHtmlText(html: string, anchorIds: string[]): HtmlText {
  const $ = cheerio.load(html);
  $("script, style, nav").remove();
  const heading =
    $("h1, h2, h3").first().text().replace(/\s+/g, " ").trim() || null;

  const lines: string[] = [];
  const anchorLines = new Map<string, number>();
  const wanted = new Set(anchorIds);
  let buffer = "";

  const flush = () => {
    const text = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (text) lines.push(text);
  };

  const walk = (node: DomNode) => {
    if (node.type === "text") {
      buffer += node.data ?? "";
      return;
    }
    if (node.type !== "tag") return;
    const name = (node.name ?? node.type).toLowerCase();
    const isBlock = BLOCK_TAGS.has(name);
    if (isBlock) flush();
    const id = node.attribs?.id;
    if (id && wanted.has(id) && !anchorLines.has(id)) anchorLines.set(id, lines.length);
    for (const child of node.children ?? []) walk(child);
    if (isBlock) flush();
  };

  const body = ($("body")[0] ?? $.root()[0]) as unknown as DomNode | undefined;
  for (const child of body?.children ?? []) walk(child);
  flush();

  return { lines, anchorLines, heading };
}

async function readNavToc(zip: JSZip, navPath: string): Promise<TocEntry[]> {
  const html = await readZipFile(zip, navPath);
  if (!html) return [];
  const $ = cheerio.load(html);
  const nav = $("nav")
    .filter((_, element) => {
      const type = ($(element).attr("epub:type") ?? "").split(/\s+/);
      return type.includes("toc") || $(element).attr("role") === "doc-toc";
    })
    .first();
  if (nav.length === 0) return [];

  const baseDir = posixDir(navPath);
  const outerOl = nav.parents("ol").length;
  const entries: TocEntry[] = [];
  nav.find("a").each((_, element) => {
    const depth = $(element).parents("ol").length - outerOl;
    if (depth > 2) return;
    const href = $(element).attr("href");
    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (!href || !title) return;
    const { path, anchor } = splitHref(href);
    entries.push({ title, file: resolveZipPath(baseDir, path), anchor });
  });
  return entries;
}

async function readNcxToc(zip: JSZip, ncxPath: string): Promise<TocEntry[]> {
  const xml = await readZipFile(zip, ncxPath);
  if (!xml) return [];
  const parsed = new XMLParser(XML_OPTS).parse(xml) as {
    ncx?: { navMap?: { navPoint?: unknown } };
  };
  const baseDir = posixDir(ncxPath);
  const entries: TocEntry[] = [];

  const walk = (points: unknown, depth: number) => {
    for (const point of toArray(points) as Record<string, unknown>[]) {
      const title = xmlText((point.navLabel as Record<string, unknown>)?.text);
      const src = (point.content as Record<string, unknown>)?.["@_src"];
      if (title && typeof src === "string" && src) {
        const { path, anchor } = splitHref(src);
        entries.push({ title, file: resolveZipPath(baseDir, path), anchor });
      }
      if (depth < 2) walk(point.navPoint, depth + 1);
    }
  };
  walk(parsed.ncx?.navMap?.navPoint, 1);
  return entries;
}

interface SpineDoc {
  file: string;
  lines: string[];
  anchorLines: Map<string, number>;
  heading: string | null;
}

export async function parseEpub(buffer: Buffer, filename: string): Promise<ParsedSource> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ParseError("无法读取 epub 文件：文件不是有效的压缩包");
  }

  const containerXml = await readZipFile(zip, "META-INF/container.xml");
  if (!containerXml) throw new ParseError("无法读取 epub 文件：缺少 META-INF/container.xml");
  const container = new XMLParser(XML_OPTS).parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: unknown } };
  };
  const rootfile = (toArray(container.container?.rootfiles?.rootfile)[0] ?? {}) as Record<
    string,
    unknown
  >;
  const opfPath = typeof rootfile["@_full-path"] === "string" ? rootfile["@_full-path"] : null;
  if (!opfPath) throw new ParseError("无法读取 epub 文件：没有找到 OPF 清单");

  const opfXml = await readZipFile(zip, opfPath);
  if (!opfXml) throw new ParseError("无法读取 epub 文件：OPF 清单缺失");
  const opf = new XMLParser(XML_OPTS).parse(opfXml) as {
    package?: {
      metadata?: Record<string, unknown>;
      manifest?: { item?: unknown };
      spine?: Record<string, unknown>;
    };
  };
  const pkg = opf.package;
  if (!pkg) throw new ParseError("无法读取 epub 文件：OPF 内容不完整");

  const title = xmlText(pkg.metadata?.["dc:title"]) ?? fallbackTitle(filename);
  const author = xmlText(pkg.metadata?.["dc:creator"]);
  const opfDir = posixDir(opfPath);

  const items = (toArray(pkg.manifest?.item) as Record<string, unknown>[])
    .map((item) => ({
      id: typeof item["@_id"] === "string" ? item["@_id"] : "",
      href: typeof item["@_href"] === "string" ? item["@_href"] : "",
      mediaType: typeof item["@_media-type"] === "string" ? item["@_media-type"] : "",
      properties: typeof item["@_properties"] === "string" ? item["@_properties"] : "",
    }))
    .filter((item) => item.id && item.href);
  const byId = new Map(items.map((item) => [item.id, item]));

  const spineHrefs = (toArray(pkg.spine?.itemref) as Record<string, unknown>[])
    .map((itemref) => byId.get(String(itemref["@_idref"] ?? ""))?.href)
    .filter((href): href is string => Boolean(href));

  const navItem = items.find((item) => item.properties.split(/\s+/).includes("nav"));
  const ncxItem =
    items.find((item) => item.mediaType === "application/x-dtbncx+xml") ??
    byId.get(String(pkg.spine?.["@_toc"] ?? ""));

  let tocEntries: TocEntry[] = [];
  if (navItem) tocEntries = await readNavToc(zip, resolveZipPath(opfDir, navItem.href));
  if (tocEntries.length === 0 && ncxItem) {
    tocEntries = await readNcxToc(zip, resolveZipPath(opfDir, ncxItem.href));
  }

  const anchorIdsByFile = new Map<string, string[]>();
  for (const entry of tocEntries) {
    if (!entry.anchor) continue;
    const list = anchorIdsByFile.get(entry.file) ?? [];
    list.push(entry.anchor);
    anchorIdsByFile.set(entry.file, list);
  }

  const docs: SpineDoc[] = [];
  for (const href of spineHrefs) {
    const file = resolveZipPath(opfDir, href);
    const html = await readZipFile(zip, file);
    if (html === null) continue;
    docs.push({ file, ...extractHtmlText(html, anchorIdsByFile.get(file) ?? []) });
  }

  // 所有 spine 文档拼成一份行序列，锚点与文件起点换算成全局行号。
  const globalLines: string[] = [];
  const fileStart = new Map<string, number>();
  const anchorGlobal = new Map<string, number>();
  for (const doc of docs) {
    if (!fileStart.has(doc.file)) fileStart.set(doc.file, globalLines.length);
    const start = fileStart.get(doc.file) ?? 0;
    for (const [id, line] of doc.anchorLines) {
      if (!anchorGlobal.has(`${doc.file}#${id}`)) {
        anchorGlobal.set(`${doc.file}#${id}`, start + line);
      }
    }
    globalLines.push(...doc.lines);
  }

  const bounds: { title: string; index: number }[] = [];
  for (const entry of tocEntries) {
    const start = fileStart.get(entry.file);
    if (start === undefined) continue;
    const index = entry.anchor
      ? (anchorGlobal.get(`${entry.file}#${entry.anchor}`) ?? start)
      : start;
    if (index < 0 || index > globalLines.length) continue;
    const previous = bounds.at(-1);
    if (previous && index <= previous.index) continue;
    bounds.push({ title: entry.title, index });
  }

  let sections: ParsedSection[];
  if (bounds.length > 0) {
    sections = bounds
      .map((bound, i) => ({
        title: bound.title,
        text: globalLines
          .slice(bound.index, i + 1 < bounds.length ? bounds[i + 1].index : globalLines.length)
          .join("\n")
          .trim(),
      }))
      .filter((section) => section.text.length > 0);
  } else {
    sections = docs
      .map((doc, index) => ({
        title: doc.heading ?? `第 ${index + 1} 部分`,
        text: doc.lines.join("\n").trim(),
      }))
      .filter((section) => section.text.length > 0);
  }

  return { title, author, sections };
}
