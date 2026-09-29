import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import iconv from "iconv-lite";
import JSZip from "jszip";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  StandardFonts,
} from "pdf-lib";

/**
 * 生成测试夹具：
 *   pnpm tsx scripts/make-fixtures.ts
 * 产物提交到 tests/fixtures/，测试直接读取，不依赖本脚本运行。
 */

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures");

interface EpubChapter {
  file: string;
  title: string;
  paragraphs: string[];
  /** 章内的第二级小节（测试锚点分节）。 */
  section?: { id: string; title: string; paragraphs: string[] };
}

const EPUB_TITLE = "沟通的艺术";
const EPUB_AUTHOR = "测试作者";

const EPUB_CHAPTERS: EpubChapter[] = [
  {
    file: "chapter1.xhtml",
    title: "第一章 开场",
    paragraphs: [
      "开场的目的是让对方愿意继续谈下去。先说明来意，再留出对方回应的空间。",
      "常见的错误是一上来就抛出结论，让对方来不及准备，谈话很快陷入防御。",
    ],
  },
  {
    file: "chapter2.xhtml",
    title: "第二章 倾听",
    paragraphs: [
      "倾听不是沉默，而是让对方确认自己的意思被听见了。复述是最简单有效的做法。",
      "听到情绪时先接住情绪，再处理事情，顺序反了往往适得其反。",
    ],
    section: {
      id: "part2",
      title: "第二节 复述",
      paragraphs: ["复述的句式很固定：你的意思是……对吗。它让对方有机会纠正你。", "复述之后不要立刻给建议，先等对方确认。"],
    },
  },
  {
    file: "chapter3.xhtml",
    title: "第三章 收尾",
    paragraphs: ["收尾时把双方确认的事复述一遍，并约定下一步的时间点。", "没有下一步约定的谈话，通常不会有结果。"],
  },
];

function xhtml(title: string, chapter: EpubChapter): string {
  const body = [
    `<h1>${chapter.title}</h1>`,
    ...chapter.paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
  ];
  if (chapter.section) {
    body.push(
      `<h2 id="${chapter.section.id}">${chapter.section.title}</h2>`,
      ...chapter.section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
    );
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title></head>
<body>
${body.join("\n")}
</body>
</html>
`;
}

function navDocument(chapters: EpubChapter[]): string {
  const items = chapters
    .map((chapter) => {
      const link = `<a href="${chapter.file}">${chapter.title}</a>`;
      if (!chapter.section) return `      <li>${link}</li>`;
      return `      <li>${link}
        <ol>
          <li><a href="${chapter.file}#${chapter.section.id}">${chapter.section.title}</a></li>
        </ol>
      </li>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc" id="toc">
<h2>目录</h2>
<ol>
${items}
</ol>
</nav>
</body>
</html>
`;
}

function opfDocument(chapters: EpubChapter[], withToc: boolean): string {
  const manifest = [
    ...(withToc
      ? [`    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`]
      : []),
    ...chapters.map(
      (chapter, index) =>
        `    <item id="chapter${index + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n");
  const spine = [
    ...(withToc ? [`    <itemref idref="nav"/>`] : []),
    ...chapters.map((_, index) => `    <itemref idref="chapter${index + 1}"/>`),
  ].join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">axiom-fixture-epub</dc:identifier>
    <dc:title>${EPUB_TITLE}</dc:title>
    <dc:creator>${EPUB_AUTHOR}</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>
`;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

async function buildEpub(withToc: boolean): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER_XML);
  zip.file("OEBPS/content.opf", opfDocument(EPUB_CHAPTERS, withToc));
  if (withToc) zip.file("OEBPS/nav.xhtml", navDocument(EPUB_CHAPTERS));
  for (const chapter of EPUB_CHAPTERS) {
    zip.file(`OEBPS/${chapter.file}`, xhtml(chapter.title, chapter));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const TXT_CHAPTERS: { title: string; paragraphs: string[] }[] = [
  {
    title: "第一章 开场的话",
    paragraphs: [
      "谈话的开场决定了后面能不能谈下去。先讲清楚来意，再给对方一点时间接受信息。",
      "很多人在这里犯的错误是铺垫太短。对方还没弄明白你要谈什么，就已经开始防御了。",
      "一个稳妥的做法是先说明目的，再说明你希望对方做什么，最后问一句对方怎么看。",
    ],
  },
  {
    title: "第二章 认真倾听",
    paragraphs: [
      "倾听的难点不在于听懂字面意思，而在于听懂对方在意什么。情绪往往是更重要的信号。",
      "当对方表达不满时，先承认他的感受，再讨论事实。顺序颠倒会让对方觉得你在辩解。",
      "复述对方的原话是成本最低的倾听技巧。它能立刻降低对方的防御。",
    ],
  },
  {
    title: "第三章 收尾与跟进",
    paragraphs: [
      "谈话结束前，把双方达成一致的部分重复一遍，尤其是时间和责任人，避免事后各说各话。",
      "如果没有约定下一步，这次谈话大概率不会有结果。约定本身就是一种承诺。",
      "收尾之后可以留一句：有变化随时告诉我。这句话会让对方更愿意保持联系。",
    ],
  },
];

function txtContent(): string {
  return `${TXT_CHAPTERS.map(
    (chapter) => `${chapter.title}\n${chapter.paragraphs.join("\n")}`,
  ).join("\n\n")}\n`;
}

const MD_CONTENT = `# 沟通方法论笔记

这份笔记整理了练习中反复用到的方法，按场景分类。

## 第一章 倾听

倾听的关键是**先接住情绪**，再处理事情。参考[复述技巧](https://example.com/repeat)。

- 复述对方原话
- 不急着给建议

## 第二章 提问

提问要用开放式问题，例如"你怎么看"。

## 第三章 收尾

收尾必须约定下一步的时间点。
`;

interface PdfChapter {
  title: string;
  lines: string[];
}

const PDF_CHAPTERS: PdfChapter[] = [
  {
    title: "Chapter 1 Listening",
    lines: [
      "Listening is not silence. It means making sure the other person feels understood.",
      "Repeat the key sentence back before offering any suggestion.",
      "Ask one open question and then wait for the answer.",
    ],
  },
  {
    title: "Chapter 2 Asking",
    lines: [
      "Open questions invite the other person to explain the situation in their own words.",
      "Closed questions are useful only when you need a decision.",
    ],
  },
  {
    title: "Chapter 3 Closing",
    lines: [
      "Summarize what both sides agreed on before the conversation ends.",
      "Always agree on a next step and a date.",
    ],
  },
];

function addOutline(doc: PDFDocument, pageRefs: PDFRef[]): void {
  const context = doc.context;
  const outlines = context.obj({});
  outlines.set(PDFName.of("Type"), PDFName.of("Outlines"));
  const outlinesRef = context.register(outlines);

  const itemRefs = pageRefs.map((pageRef, index) => {
    const dest = PDFArray.withContext(context);
    dest.push(pageRef);
    dest.push(PDFName.of("Fit"));
    const item = context.obj({});
    item.set(PDFName.of("Title"), PDFString.of(PDF_CHAPTERS[index].title));
    item.set(PDFName.of("Parent"), outlinesRef);
    item.set(PDFName.of("Dest"), dest);
    return context.register(item);
  });

  itemRefs.forEach((ref, index) => {
    const item = context.lookup(ref);
    if (!(item instanceof PDFDict)) return;
    if (index > 0) item.set(PDFName.of("Prev"), itemRefs[index - 1]);
    if (index < itemRefs.length - 1) item.set(PDFName.of("Next"), itemRefs[index + 1]);
  });

  outlines.set(PDFName.of("First"), itemRefs[0]);
  outlines.set(PDFName.of("Last"), itemRefs[itemRefs.length - 1]);
  outlines.set(PDFName.of("Count"), PDFNumber.of(itemRefs.length));
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

/** 一页一章；withOutline 为 true 时写入书签，否则只留 "Chapter N" 标题交由标题正则切分。 */
async function buildPdf(withOutline: boolean): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Communication Guide");
  doc.setAuthor("Fixture Author");
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pageRefs: PDFRef[] = [];
  for (const chapter of PDF_CHAPTERS) {
    const page = doc.addPage([595, 842]);
    pageRefs.push(page.ref);
    let y = 760;
    page.drawText(chapter.title, { x: 60, y, size: 18, font });
    y -= 40;
    for (const line of chapter.lines) {
      page.drawText(line, { x: 60, y, size: 12, font });
      y -= 22;
    }
  }
  if (withOutline) addOutline(doc, pageRefs);
  return Buffer.from(await doc.save());
}

async function main(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  const files: { name: string; data: Buffer }[] = [
    { name: "sample.epub", data: await buildEpub(true) },
    { name: "sample-no-toc.epub", data: await buildEpub(false) },
    { name: "sample-gbk.txt", data: iconv.encode(txtContent(), "gbk") },
    { name: "sample.md", data: Buffer.from(MD_CONTENT, "utf8") },
    { name: "sample.pdf", data: await buildPdf(true) },
    { name: "sample-no-bookmark.pdf", data: await buildPdf(false) },
  ];

  for (const file of files) {
    writeFileSync(join(FIXTURES_DIR, file.name), file.data);
    console.log(`✓ ${file.name}（${file.data.length} 字节）`);
  }
  console.log(`夹具已写入 ${FIXTURES_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
