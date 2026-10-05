import type { PDFPageProxy } from 'pdfjs-dist';
import { loadPdfjs } from './pdfjs';

const COVER_HEIGHT = 1600;

export async function renderPageAsCover(page: PDFPageProxy): Promise<File> {
  const viewport = page.getViewport({ scale: COVER_HEIGHT / page.getViewport({ scale: 1 }).height });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport, background: 'white' }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not render the cover image.');
  return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
}

export async function createCoverFromPdf(file: File): Promise<File> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await loadingTask.promise;
    return await renderPageAsCover(await pdf.getPage(1));
  } finally {
    await loadingTask.destroy();
  }
}
