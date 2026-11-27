import { CV_TEXT_LIMIT } from "./job-cv-match";
import { appPath } from "./app-path";

export const CV_FILE_COUNT_LIMIT = 10;
export const CV_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const BATCH_SIZE_LIMIT = 60 * 1024 * 1024;
const SLIDE_LIMIT = 250;
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const STRICT_A = "http://purl.oclc.org/ooxml/drawingml/main";
const STRICT_P = "http://purl.oclc.org/ooxml/presentationml/main";
export class CvFileImportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly diagnostic = "",
  ) {
    super(message);
    this.name = "CvFileImportError";
  }
}
const technicalReason = (error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.replace(/[\r\n]+/gu, " ").slice(0, 800);
};
export function cvImportDiagnostic(error: unknown) {
  return error instanceof CvFileImportError
    ? `${error.code}${error.diagnostic ? `: ${error.diagnostic}` : ""}`
    : "";
}
export type CvImportFile = Pick<File, "name" | "size" | "arrayBuffer" | "text">;
export type CvImportedDocument = {
  name: string;
  format: "pdf" | "ppt" | "pptx" | "text";
  text: string;
  pages: number;
  hiddenPages: number;
  emptyPages: number;
};
type ImportedSlide = { number: number; text: string; hidden: boolean };
const clean = (text: string) =>
  text
    .replace(/\r\n?|\u000b/gu, "\n")
    .replace(/[\u0000-\u0008\u000c\u000e-\u001f]/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

export function validateCvFiles(files: CvImportFile[]) {
  if (!files.length) throw new Error("Välj minst en fil.");
  if (files.length > CV_FILE_COUNT_LIMIT)
    throw new Error("Välj högst 10 filer åt gången.");
  if (files.reduce((sum, file) => sum + file.size, 0) > BATCH_SIZE_LIMIT)
    throw new Error(
      "Filerna får tillsammans vara högst 60 MB. Välj färre filer åt gången.",
    );
}

function documentText(
  name: string,
  format: "pdf" | "ppt" | "pptx",
  slides: ImportedSlide[],
): CvImportedDocument {
  const visible = slides.filter((slide) => !slide.hidden);
  const content = visible.filter((slide) => /\p{L}/u.test(slide.text));
  if (!content.length)
    throw new CvFileImportError(
      format === "pdf"
        ? "PDF-filen saknar läsbar text. Om sidorna är skannade bilder behöver texten kopieras in från en OCR-behandlad kopia."
        : "Ingen läsbar text hittades på presentationsbilderna. Text som ligger i foton eller skärmbilder behöver kopieras in manuellt.",
      format === "pdf" ? "PDF_NO_TEXT" : "NO_SLIDE_TEXT",
      `${format.toUpperCase()}; ${slides.length} bilder, ${visible.length} synliga, 0 med läsbar text.`,
    );
  const text = content
    .map(
      (slide) =>
        `[${format === "pdf" ? "Sida" : "Bild"} ${slide.number}]\n${slide.text}`,
    )
    .join("\n\n");
  if (text.length > CV_TEXT_LIMIT)
    throw new Error(
      "Filen innehåller mer än 60 000 tecken. Dela upp underlaget eller välj färre sidor.",
    );
  return {
    name,
    format,
    text,
    pages: content.length,
    hiddenPages: slides.length - visible.length,
    emptyPages: visible.length - content.length,
  };
}

function xml(bytes: Uint8Array | undefined): Document {
  if (!bytes) throw new Error("En del av PowerPoint-filen saknas.");
  const encoding =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || bytes[1] === 0
      ? "utf-16le"
      : (bytes[0] === 0xfe && bytes[1] === 0xff) || bytes[0] === 0
        ? "utf-16be"
        : "utf-8";
  let value: string;
  try {
    value = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "PowerPoint-filens textkodning kunde inte läsas. Spara en ny kopia och försök igen.",
    );
  }
  if (/<!DOCTYPE|<!ENTITY/iu.test(value))
    throw new Error("PowerPoint-filen har ett XML-format som inte stöds.");
  const parsed = new DOMParser().parseFromString(value, "application/xml");
  if (parsed.getElementsByTagNameNS("*", "parsererror").length)
    throw new Error("PowerPoint-filens text är skadad och kunde inte läsas.");
  return parsed;
}
const nodes = (
  parent: Document | Element,
  namespaces: string[],
  local: string,
) =>
  Array.from(parent.getElementsByTagNameNS("*", local)).filter((node) =>
    namespaces.includes(node.namespaceURI ?? ""),
  );

function drawingText(node: Element): string {
  if ([A, STRICT_A].includes(node.namespaceURI ?? "")) {
    if (node.localName === "t") return node.textContent ?? "";
    if (node.localName === "br") return "\n";
    if (node.localName === "tab") return "\t";
  }
  return Array.from(node.children).map(drawingText).join("");
}

function hiddenShape(paragraph: Element) {
  for (
    let parent = paragraph.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (![P, STRICT_P].includes(parent.namespaceURI ?? "")) continue;
    for (const properties of Array.from(parent.children).filter((child) =>
      /^nv/u.test(child.localName),
    ))
      if (
        Array.from(properties.children).some(
          (child) =>
            child.localName === "cNvPr" &&
            ["1", "true"].includes(child.getAttribute("hidden") ?? ""),
        )
      )
        return true;
  }
  return false;
}

function placeholderText(paragraph: Element) {
  for (
    let parent = paragraph.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (![P, STRICT_P].includes(parent.namespaceURI ?? "")) continue;
    for (const properties of Array.from(parent.children).filter((child) =>
      /^nv/u.test(child.localName),
    ))
      if (nodes(properties, [P, STRICT_P], "ph").length) return true;
  }
  return false;
}

function xmlText(document: Document, staticOnly = false) {
  return nodes(document, [A, STRICT_A], "p")
    .filter(
      (paragraph) =>
        !hiddenShape(paragraph) && (!staticOnly || !placeholderText(paragraph)),
    )
    .map((paragraph) => clean(drawingText(paragraph)))
    .filter(Boolean);
}

function partTargets(
  files: Record<string, Uint8Array>,
  part: string,
  kind: string,
) {
  const split = part.lastIndexOf("/");
  const relPath = `${part.slice(0, split)}/_rels/${part.slice(split + 1)}.rels`;
  const targets = new Map<string, string>();
  if (!files[relPath]) return targets;
  for (const rel of Array.from(
    xml(files[relPath]).getElementsByTagNameNS("*", "Relationship"),
  )) {
    if (
      !(rel.getAttribute("Type") ?? "").endsWith(`/${kind}`) ||
      rel.getAttribute("TargetMode") === "External"
    )
      continue;
    const target = new URL(
      rel.getAttribute("Target") ?? "",
      `https://powerpoint.invalid/${part}`,
    );
    if (
      target.origin !== "https://powerpoint.invalid" ||
      !/^\/ppt\/(?:slides|slideLayouts|slideMasters)\/[^/]+\.xml$/u.test(
        target.pathname,
      )
    )
      continue;
    targets.set(rel.getAttribute("Id") ?? "", target.pathname.slice(1));
  }
  return targets;
}

function mergeInherited(own: string[], inherited: string[]) {
  const used = new Set<string>();
  const additions = inherited.filter((text) => {
    if (used.has(text)) return false;
    used.add(text);
    return !own.some(
      (paragraph) => paragraph === text || paragraph.includes(text),
    );
  });
  return clean([...additions, ...own].join("\n"));
}

export async function readPptx(
  bytes: Uint8Array,
  name: string,
): Promise<CvImportedDocument> {
  const { unzipSync } = await import("fflate").catch((error) => {
    throw new CvFileImportError(
      "PPTX-läsaren kunde inte laddas. Kontrollera internetanslutningen och ladda om sidan.",
      "PPTX_READER_LOAD",
      technicalReason(error),
    );
  });
  let total = 0,
    entries = 0;
  const seen = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (entry) => {
        if (++entries > 4096)
          throw new Error("PowerPoint-filen innehåller för många delar.");
        if (
          !/^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|(?:slides|slideLayouts|slideMasters)\/(?:[^/]+\.xml|_rels\/[^/]+\.xml\.rels))$/u.test(
            entry.name,
          )
        )
          return false;
        total += entry.originalSize;
        if (
          entry.originalSize > 2 * 1024 * 1024 ||
          total > 16 * 1024 * 1024 ||
          seen.has(entry.name)
        )
          throw new Error(
            "PowerPoint-filens textdelar är för stora eller ogiltiga.",
          );
        seen.add(entry.name);
        return true;
      },
    });
  } catch (error) {
    if (typeof (error as { code?: unknown })?.code === "number")
      throw new CvFileImportError(
        "PPTX-filen är skadad eller lösenordsskyddad. Spara en ny kopia utan lösenord och försök igen.",
        "PPTX_ARCHIVE",
        technicalReason(error),
      );
    throw error;
  }
  const presentation = xml(files["ppt/presentation.xml"]);
  // The presentation's current slide list is authoritative; unused parts are ignored.
  if (!files["ppt/_rels/presentation.xml.rels"])
    throw new Error("En del av PowerPoint-filen saknas.");
  const targets = partTargets(files, "ppt/presentation.xml", "slide");
  const list = nodes(presentation, [P, STRICT_P], "sldIdLst")[0];
  const ids = list
    ? Array.from(list.children).filter(
        (node) =>
          node.localName === "sldId" &&
          [P, STRICT_P].includes(node.namespaceURI ?? ""),
      )
    : [];
  if (!ids.length || ids.length > SLIDE_LIMIT)
    throw new Error("Presentationen måste innehålla mellan 1 och 250 bilder.");
  const slides = ids.map((id, index): ImportedSlide => {
    const relationshipId =
      id.getAttributeNS(R, "id") ??
      id.getAttributeNS(
        "http://purl.oclc.org/ooxml/officeDocument/relationships",
        "id",
      );
    const path = targets.get(relationshipId ?? "");
    if (!path)
      throw new Error(
        "Presentationsordningen kunde inte läsas. Spara filen på nytt i PowerPoint och försök igen.",
      );
    const slide = xml(files[path]);
    const hidden = ["0", "false"].includes(
      slide.documentElement.getAttribute("show") ?? "",
    );
    const inherited: string[] = [];
    if (
      !hidden &&
      !["0", "false"].includes(
        slide.documentElement.getAttribute("showMasterSp") ?? "",
      )
    ) {
      const layoutPath = [
        ...partTargets(files, path, "slideLayout").values(),
      ][0];
      if (layoutPath) {
        const layout = xml(files[layoutPath]);
        if (
          !["0", "false"].includes(
            layout.documentElement.getAttribute("showMasterSp") ?? "",
          )
        ) {
          const masterPath = [
            ...partTargets(files, layoutPath, "slideMaster").values(),
          ][0];
          if (masterPath)
            inherited.push(...xmlText(xml(files[masterPath]), true));
        }
        inherited.push(...xmlText(layout, true));
      }
    }
    return {
      number: index + 1,
      hidden,
      text: mergeInherited(xmlText(slide), inherited),
    };
  });
  return documentText(name, "pptx", slides);
}

type TextShape = {
  hidden?: boolean;
  text?: { sourceText?: string; paragraphs: { runs: { text: string }[] }[] };
  wordArt?: { text: string };
  placeholder?: unknown;
  children?: TextShape[];
};
function shapeText(shapes: TextShape[], staticOnly = false): string[] {
  return shapes.flatMap((shape) => {
    if (shape.hidden || (staticOnly && shape.placeholder)) return [];
    const paragraphs = shape.text?.paragraphs
      .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
      .join("\n");
    const text = shape.text?.sourceText?.trim()
      ? shape.text.sourceText
      : paragraphs || shape.wordArt?.text;
    return [
      ...(text ? [clean(text)] : []),
      ...shapeText(shape.children ?? [], staticOnly),
    ];
  });
}

export async function readPpt(
  bytes: Uint8Array,
  name: string,
): Promise<CvImportedDocument> {
  const { parsePpt } = await import("@file-viewer/ppt/parser").catch(
    (error) => {
      throw new CvFileImportError(
        "PPT-läsaren kunde inte laddas. Kontrollera internetanslutningen och ladda om sidan.",
        "PPT_READER_LOAD",
        technicalReason(error),
      );
    },
  );
  try {
    const model = parsePpt(bytes, {
      limits: {
        maxFileBytes: CV_FILE_SIZE_LIMIT,
        maxStreamBytes: CV_FILE_SIZE_LIMIT,
        maxAssetBytes: CV_FILE_SIZE_LIMIT,
        maxRecords: 150000,
        maxSlides: SLIDE_LIMIT,
        maxShapes: 20000,
        maxDepth: 64,
        maxTextLength: CV_TEXT_LIMIT,
      },
    });
    const errors = model.diagnostics.filter(
      (item) => item.severity === "error",
    );
    if (errors.length)
      throw new CvFileImportError(
        "Filen kunde inte läsas fullständigt. Spara en ny kopia i PowerPoint och försök igen.",
        "PPT_INCOMPLETE",
        errors.map((error) => error.code).join(", "),
      );
    const masters = new Map(model.masters.map((master) => [master.id, master]));
    const masterText = (
      id: number | undefined,
      seen = new Set<number>(),
    ): string[] => {
      if (id === undefined || seen.has(id)) return [];
      const master = masters.get(id);
      if (!master) return [];
      seen.add(id);
      return [
        ...(master.showMasterShapes === false
          ? []
          : masterText(master.masterId, seen)),
        ...shapeText(master.shapes, true),
      ];
    };
    return documentText(
      name,
      "ppt",
      model.slides.map((slide, index) => ({
        number: index + 1,
        hidden: slide.hidden ?? false,
        text: mergeInherited(
          shapeText(slide.shapes),
          slide.hidden || slide.showMasterShapes === false
            ? []
            : masterText(slide.masterId),
        ),
      })),
    );
  } catch (error) {
    if (error instanceof CvFileImportError) throw error;
    const code = (error as { code?: string })?.code ?? "";
    if (/ENCRYPT|PASSWORD/iu.test(code))
      throw new CvFileImportError(
        "Filen är lösenordsskyddad. Spara en kopia utan lösenord och välj den.",
        code,
        technicalReason(error),
      );
    if (code === "NOT_PPT")
      throw new CvFileImportError(
        "PPT-formatet i filen stöds inte. Öppna filen i PowerPoint och spara en kopia som .pptx.",
        code,
        technicalReason(error),
      );
    if (/^LIMIT_/u.test(code))
      throw new CvFileImportError(
        "Presentationen är för stor eller komplex för att läsas här. Dela upp den i färre bilder och försök igen.",
        code,
        technicalReason(error),
      );
    if (code)
      throw new CvFileImportError(
        "PPT-filen kunde inte läsas. Kontrollera att den går att öppna i PowerPoint och spara gärna en ny kopia.",
        code,
        technicalReason(error),
      );
    throw error;
  }
}

async function readPdf(
  bytes: Uint8Array,
  name: string,
): Promise<CvImportedDocument> {
  const pdf = await import("pdfjs-dist").catch((error) => {
    throw new CvFileImportError(
      "PDF-läsaren kunde inte laddas. Kontrollera internetanslutningen och ladda om sidan.",
      "PDF_READER_LOAD",
      technicalReason(error),
    );
  });
  const assets = appPath(`/vendor/pdfjs/${pdf.version}/`);
  pdf.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
  const task = pdf.getDocument({
    data: bytes,
    cMapUrl: `${assets}cmaps/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
    useWorkerFetch: false,
    useWasm: false,
    disableFontFace: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void task.destroy().catch(() => undefined);
  }, 30000);
  try {
    const document = await task.promise;
    if (!document.numPages || document.numPages > SLIDE_LIMIT)
      throw new CvFileImportError(
        "PDF-filen måste innehålla mellan 1 och 250 sidor. Dela upp en längre fil och försök igen.",
        "PDF_PAGE_LIMIT",
      );
    const pages: ImportedSlide[] = [];
    let length = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const reader = page.streamTextContent().getReader();
      const parts: string[] = [];
      let textLimitExceeded = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const item of value.items as {
            str?: string;
            hasEOL?: boolean;
          }[]) {
            if (typeof item.str !== "string") continue;
            const text = item.str + (item.hasEOL ? "\n" : "");
            length += text.length;
            if (length > CV_TEXT_LIMIT) textLimitExceeded = true;
            else parts.push(text);
          }
        }
      } finally {
        reader.releaseLock();
        page.cleanup();
      }
      // Finish the current page's stream before destroying the document. This
      // avoids a race between PDF.js closing a stream and cancelling its reader.
      if (textLimitExceeded)
        throw new CvFileImportError(
          "PDF-filen innehåller mer än 60 000 tecken. Dela upp underlaget eller välj färre sidor.",
          "PDF_TEXT_LIMIT",
        );
      pages.push({ number, text: clean(parts.join("")), hidden: false });
    }
    return documentText(name, "pdf", pages);
  } catch (error) {
    if (error instanceof CvFileImportError) throw error;
    const type = error instanceof Error ? error.name : "";
    throw new CvFileImportError(
      timedOut
        ? "PDF-filen tog för lång tid att läsa. Dela upp filen eller spara en ny kopia och försök igen."
        : type === "PasswordException"
          ? "PDF-filen är lösenordsskyddad. Spara en kopia utan lösenord och välj den."
          : "PDF-filen kunde inte läsas. Kontrollera att den går att öppna och spara gärna en ny kopia.",
      timedOut
        ? "PDF_TIMEOUT"
        : type === "PasswordException"
          ? "PDF_PASSWORD"
          : "PDF_READ",
      technicalReason(error),
    );
  } finally {
    clearTimeout(timeout);
    await task.destroy().catch(() => undefined);
  }
}

export async function readCvFile(
  file: CvImportFile,
): Promise<CvImportedDocument> {
  const extension = file.name
    .match(/\.(pdf|pptx?|txt|md)$/iu)?.[1]
    .toLowerCase();
  if (!extension)
    throw new Error(
      "Välj PDF (.pdf), PowerPoint (.ppt eller .pptx) eller en textfil (.txt eller .md).",
    );
  if (!file.size || file.size > CV_FILE_SIZE_LIMIT)
    throw new Error("Filen är tom eller större än 20 MB.");
  if (["txt", "md"].includes(extension)) {
    if (file.size > CV_TEXT_LIMIT * 4)
      throw new Error(
        "Textfilen är för stor. Underlaget får vara högst 60 000 tecken.",
      );
    const text = clean((await file.text()).replace(/^\uFEFF/u, ""));
    if (!text || text.length > CV_TEXT_LIMIT)
      throw new Error(
        "Textfilen är tom eller innehåller mer än 60 000 tecken.",
      );
    return {
      name: file.name,
      format: "text",
      text,
      pages: 0,
      hiddenPages: 0,
      emptyPages: 0,
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Read the actual container; a file provider's MIME type need not be correct.
  if (
    new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-")
  )
    return readPdf(bytes, file.name);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readPptx(bytes, file.name);
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
    return readPpt(bytes, file.name);
  if (extension === "pdf")
    throw new CvFileImportError(
      "Filen har inte ett läsbart PDF-format. Kontrollera filen eller spara en ny kopia.",
      "PDF_SIGNATURE",
    );
  throw new Error(
    "Filen har inte ett läsbart PowerPoint-format. Kontrollera filen eller spara en ny kopia.",
  );
}

export function appendCvDocument(
  existing: string,
  document: CvImportedDocument,
) {
  const body = document.text.trim();
  if (existing.includes(body)) return { text: existing, added: false };
  const name = document.name.replace(/[\r\n\[\]]/gu, " ").slice(0, 200);
  const section =
    document.format === "text" ? body : `[Källa: ${name}]\n${body}`;
  const text = existing.trim()
    ? `${existing.trimEnd()}\n\n${section}`
    : section;
  if (text.length > CV_TEXT_LIMIT)
    throw new Error(
      "Texten får inte plats i underlaget (högst 60 000 tecken). Befintlig text är kvar. Välj mindre underlag eller korta texten.",
    );
  return { text, added: true };
}
