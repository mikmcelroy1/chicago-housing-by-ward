/**
 * Reading the scanned exhibits: a planned development's "Statements and Plans" (its bulk table carries the
 * Maximum Dwelling Unit Count) and a Type 1 rezoning's "Narrative and Plans". The City Clerk's copies are images
 * with no text layer, so each is downloaded, rendered page by page with pdftoppm and read with tesseract until
 * the dwelling-unit line has been seen (plus one page), or MAX_PAGES; a longer exhibit with no count yet is
 * continued for another MAX_PAGES on the next run. A PDF that does have a text layer is read with pdftotext instead.
 *
 * Results persist in zoning_attachment_texts (a file under data/cache for dry runs) so a nightly run only reads
 * new attachments; the backfill is a one-time local run with a high --ocr-limit. Transient failures (network,
 * out of memory) are not stored and are retried next run; a file that is not a PDF is stored empty so a person
 * can look at it once instead of the job retrying it every night.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const MAX_PAGES = 30;
export const OCR_DPI = 200;
/** Pages whose pdftotext output has at least this many non-space characters have a text layer. */
const TEXT_LAYER_CHARS = 120;
/**
 * Read one page past the first page that carries a unit count: a planned development's "Maximum Dwelling Unit
 * Count" line (its use list says "Dwelling Units located above the ground floor" pages earlier) or a narrative's
 * "30 dwelling units" / "Dwelling Units: 30". The table may wrap, hence the extra page.
 */
export const STOP_RE = /Max(?:imum|\.)?\s+(?:Number\s+of\s+|No\.?\s+of\s+|Permitted\s+)?(?:Residential\s+)?Dwelling(?:\s+Uni[tl]s?)?\s*(?:\([^)\n]{0,40}\))?\s*[:;]?\s*(?:\(?[\d,]{1,7}|N\/A|None)|\b\d{1,4}\s+(?:residential\s+|new\s+|total\s+)?dwelling\s+units?\b|dwelling\s+units?\s*(?:proposed|total)?\s*[:=]\s*\d|\(\s*\d{1,3}\s*\)\s+dwelling\s+units?|no\s+(?:residential\s+)?dwelling\s+units/i;

/** A read that stopped before the end without seeing a count is continued from the next page on the next run. */
export function incomplete(t: ExhibitText): boolean {
  return t.method === "ocr" && t.pages_total !== null && t.pages_read < t.pages_total && !STOP_RE.test(t.text);
}

export interface ExhibitText {
  source_url: string;
  record_number: string;
  file_name: string | null;
  text: string;
  pages_read: number;
  pages_total: number | null;
  method: "pdftotext" | "ocr";
  engine: string | null;
  extracted_at: string;
}

export interface OcrTools {
  ok: boolean;
  engine: string | null;
  missing: string[];
}

/** pdfinfo, pdftotext, pdftoppm (poppler) and tesseract must be on PATH. */
export async function ocrTools(): Promise<OcrTools> {
  const missing: string[] = [];
  for (const tool of ["pdfinfo", "pdftotext", "pdftoppm", "tesseract"]) {
    try {
      await execFileP(tool, ["--version"]).catch((e: { stderr?: string; stdout?: string; code?: unknown }) => {
        // pdfinfo and pdftotext print their version on stderr and exit 0 or 99 (no file given); a missing binary throws ENOENT.
        if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") throw e;
      });
    } catch {
      missing.push(tool);
    }
  }
  let engine: string | null = null;
  if (!missing.includes("tesseract")) {
    const v = await execFileP("tesseract", ["--version"]).catch((e: { stderr?: string }) => ({ stdout: "", stderr: e.stderr ?? "" }));
    const m = /tesseract\s+v?(\S+)/.exec(`${v.stdout}\n${v.stderr}`);
    engine = m ? `tesseract ${m[1]}` : "tesseract";
  }
  return { ok: missing.length === 0, engine, missing };
}

async function download(url: string, dest: string): Promise<"ok" | "not_pdf" | "transient"> {
  // The timeout covers the body too: a slow download of a large scan is transient, not fatal.
  let bytes: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (res.status === 404 || res.status === 410) return "not_pdf";
    if (!res.ok) return "transient";
    bytes = Buffer.from(await res.arrayBuffer());
  } catch {
    return "transient";
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return "not_pdf";
  writeFileSync(dest, bytes);
  return "ok";
}

async function pageCount(pdf: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP("pdfinfo", [pdf]);
    const m = /^Pages:\s+(\d+)/m.exec(stdout);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function pdftotext(pdf: string, first: number, last: number): Promise<string> {
  const { stdout } = await execFileP("pdftotext", ["-f", String(first), "-l", String(last), "-layout", pdf, "-"], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function ocrPage(pdf: string, page: number, base: string): Promise<string> {
  await execFileP("pdftoppm", ["-r", String(OCR_DPI), "-gray", "-f", String(page), "-l", String(page), "-singlefile", pdf, base], { timeout: 120_000 });
  const image = `${base}.pgm`;
  await execFileP("tesseract", [image, base, "--psm", "6"], { timeout: 180_000, env: { ...process.env, OMP_THREAD_LIMIT: "1" } });
  const text = readFileSync(`${base}.txt`, "utf8");
  rmSync(image, { force: true });
  rmSync(`${base}.txt`, { force: true });
  return text;
}

export interface ReadOptions {
  maxPages?: number;
  engine: string | null;
  tmpDir?: string;
  /** An earlier read of the same file to continue from (its text is kept, pages after it are read). */
  resume?: ExhibitText;
}

/**
 * Read one exhibit. Returns null on a transient failure (retry next run); an empty text for a file that is not a
 * readable PDF (stored, so a person looks once).
 */
export async function readExhibit(att: { source_url: string; file_name: string | null }, recordNumber: string, opts: ReadOptions): Promise<ExhibitText | null> {
  const dir = opts.tmpDir ?? join(tmpdir(), "ward-housing-exhibits");
  mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pdf = join(dir, `${stamp}.pdf`);
  const base = join(dir, `${stamp}-page`);
  const done = (text: string, pagesRead: number, pagesTotal: number | null, method: ExhibitText["method"]): ExhibitText => ({
    source_url: att.source_url, record_number: recordNumber, file_name: att.file_name, text, pages_read: pagesRead, pages_total: pagesTotal, method, engine: method === "ocr" ? opts.engine : "pdftotext", extracted_at: new Date().toISOString(),
  });
  try {
    const got = await download(att.source_url, pdf);
    if (got === "transient") return null;
    if (got === "not_pdf") return done("", 0, null, "ocr");
    const total = await pageCount(pdf);
    if (total === null) return done("", 0, null, "ocr");
    // A resumed read continues for another MAX_PAGES; a first read stops at MAX_PAGES.
    const start = opts.resume?.pages_read ?? 0;
    const maxPages = Math.min(start + (opts.maxPages ?? MAX_PAGES), total);
    // A text layer? Try the first pages with pdftotext.
    const probe = await pdftotext(pdf, 1, Math.min(4, total)).catch(() => "");
    if (probe.replace(/\s+/g, "").length >= TEXT_LAYER_CHARS * Math.min(4, total)) {
      const text = await pdftotext(pdf, 1, maxPages).catch(() => probe);
      return done(text, maxPages, total, "pdftotext");
    }
    let text = opts.resume?.text ?? "";
    let seenAt: number | null = null;
    let read = start;
    for (let p = read + 1; p <= maxPages; p++) {
      try {
        const page = await ocrPage(pdf, p, base);
        text += (text ? "\n\f\n" : "") + page;
      } catch (err) {
        if (/ENOMEM|EAGAIN|ENOSPC|SIGKILL/.test(String(err))) return null;
        text += "\n\f\n";
      }
      read = p;
      if (seenAt === null && STOP_RE.test(text)) seenAt = p;
      if (seenAt !== null && p >= seenAt + 1) break;
    }
    return done(text, read, total, "ocr");
  } finally {
    rmSync(pdf, { force: true });
    rmSync(`${base}.pgm`, { force: true });
    rmSync(`${base}.txt`, { force: true });
  }
}

// --- the store --------------------------------------------------------------------------------------------

/** Exhibit texts read so far, with the ones this run added, so the live load writes only those. */
export class ExhibitStore {
  private readonly texts = new Map<string, ExhibitText>();
  private readonly fresh: ExhibitText[] = [];

  constructor(initial: Iterable<ExhibitText> = []) {
    for (const t of initial) this.texts.set(t.source_url, t);
  }
  get(url: string): ExhibitText | undefined {
    return this.texts.get(url);
  }
  has(url: string): boolean {
    return this.texts.has(url);
  }
  add(t: ExhibitText): void {
    this.texts.set(t.source_url, t);
    this.fresh.push(t);
  }
  get size(): number {
    return this.texts.size;
  }
  added(): ExhibitText[] {
    return [...this.fresh];
  }
  /** Text by url for readMatter's exhibit_texts. */
  byUrl(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [url, t] of this.texts) out[url] = t.text;
    return out;
  }
  all(): ExhibitText[] {
    return [...this.texts.values()];
  }
}

export function loadExhibitFile(file: string): ExhibitStore {
  if (!existsSync(file)) return new ExhibitStore();
  return new ExhibitStore(JSON.parse(readFileSync(file, "utf8")) as ExhibitText[]);
}

export function saveExhibitFile(file: string, store: ExhibitStore): void {
  writeFileSync(file, JSON.stringify(store.all()));
}
