import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItemBox } from '@/server/adapters/extraction/textLayer';

export class UnreadableDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableDocumentError';
  }
}

export interface Preflight {
  pages: number;
  textLayer: boolean;
  scanned: boolean;
  items: TextItemBox[];
  attachments: { name: string; bytes: Uint8Array }[];
  renders: Uint8Array[];
}

const XML_NAME = /\.xml$/i;

/** Page count, text layer, embedded files, and PNG renders for QR. Images are a single page. */
export async function preflight(
  bytes: Uint8Array,
  mime: string,
  maxPages: number,
): Promise<Preflight> {
  if (mime === 'image/png' || mime === 'image/jpeg') {
    return { pages: 1, textLayer: false, scanned: true, items: [], attachments: [], renders: [bytes] };
  }
  if (mime !== 'application/pdf') {
    throw new UnreadableDocumentError('Upload a PDF, PNG, or JPG');
  }
  return readPdf(bytes, maxPages);
}

async function readPdf(bytes: Uint8Array, maxPages: number): Promise<Preflight> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    document = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) {
      throw new UnreadableDocumentError('This PDF is password protected');
    }
    throw new UnreadableDocumentError('This PDF could not be opened');
  }
  const pages = Math.min(document.numPages, maxPages);
  const items: TextItemBox[] = [];
  const renders: Uint8Array[] = [];
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim().length === 0) continue;
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      items.push({
        page: pageNumber,
        text: item.str,
        x: unit(x, viewport.width),
        y: unit(viewport.height - y - item.height, viewport.height),
        w: unit(item.width, viewport.width),
        h: unit(item.height, viewport.height),
      });
    }
    const png = await renderPage(page, viewport.width, viewport.height);
    if (png) renders.push(png);
  }
  const attachments = await readAttachments(document);
  const textLayer = items.some((item) => item.text.trim().length > 0);
  return { pages, textLayer, scanned: !textLayer, items, attachments, renders };
}

async function readAttachments(document: PDFDocumentProxy): Promise<{ name: string; bytes: Uint8Array }[]> {
  const map = await document.getAttachments();
  if (!map) return [];
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const [name, file] of map) {
    const filename = file.filename || name;
    if (!file.content || !XML_NAME.test(filename)) continue;
    files.push({ name: filename, bytes: file.content });
  }
  return files;
}

async function renderPage(page: PDFPageProxy, width: number, height: number): Promise<Uint8Array | undefined> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const scale = 2;
    const canvas = createCanvas(Math.ceil(width * scale), Math.ceil(height * scale));
    const viewport = page.getViewport({ scale });
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    return new Uint8Array(await canvas.encode('png'));
  } catch {
    return undefined;
  }
}

function unit(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  const ratio = value / total;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}
