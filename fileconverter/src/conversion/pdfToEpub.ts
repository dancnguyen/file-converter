import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageImage } from './pdfImages';
import { loadPdfjs } from './pdfjs';

type EpubFn = typeof import('epub-gen-memory/bundle').default;

type Paragraph = { text: string; top: number };

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toParagraphs(items: TextItem[]) {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | undefined;
  let lastY: number | undefined;

  for (const item of items) {
    const y = item.transform[5];
    const lineHeight = item.height || 12;
    if (lastY !== undefined && Math.abs(lastY - y) > lineHeight * 1.8 && current?.text.trim()) {
      paragraphs.push(current);
      current = undefined;
    }
    current ??= { text: '', top: y + lineHeight };
    current.text += item.str + (item.hasEOL ? ' ' : '');
    if (item.str) lastY = y;
  }
  if (current?.text.trim()) paragraphs.push(current);
  return paragraphs;
}

// Places each image before the first paragraph that starts below the image's top edge,
// keeping the text in reading order. Images are sized relative to the page width.
function pageToHtml(paragraphs: Paragraph[], images: PageImage[], pageWidth: number, pageNumber: number) {
  const pending = [...images].sort((a, b) => b.top - a.top);
  const imageHtml = (image: PageImage) => {
    const widthPercent = Math.min(100, Math.round((image.width / pageWidth) * 100));
    return `<img src="${escapeHtml(image.url)}" alt="Image from page ${pageNumber}" style="display: block; margin: 1em auto; max-width: 100%; width: ${widthPercent}%;" />`;
  };

  const html: string[] = [];
  for (const paragraph of paragraphs) {
    while (pending.length && pending[0].top >= paragraph.top - 1) html.push(imageHtml(pending.shift()!));
    html.push(`<p>${escapeHtml(paragraph.text.trim().replace(/\s+/g, ' '))}</p>`);
  }
  html.push(...pending.map(imageHtml));
  return html.join('\n');
}

const coverExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// epub-gen-memory takes the cover's type from its file name, so give it a name matching its actual type.
function normalizeCover(cover: File) {
  const extension = coverExtensions[cover.type];
  if (!extension) throw new Error('The cover image must be a JPEG or PNG.');
  return new File([cover], `cover.${extension}`, { type: cover.type });
}

function coverPageXhtml(href: string, width: number, height: number) {
  // An SVG wrapper scales the image to fill the screen while keeping its proportions, across most readers.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover</title>
  <style>html, body { margin: 0; padding: 0; height: 100%; } svg { display: block; }</style>
</head>
<body epub:type="cover">
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <image width="${width}" height="${height}" xlink:href="${href}" />
  </svg>
</body>
</html>
`;
}

// Adds what epub-gen-memory leaves out for the cover:
// - properties="cover-image" on the image, which EPUB 3 readers such as Apple Books look for
//   (the library only writes the EPUB 2 style <meta name="cover">);
// - a cover page at the start of the book, also listed in <guide> for Kindle and older readers.
async function addCover(epubBlob: Blob, coverSize: { width: number; height: number }): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(epubBlob);
  const opfPath = 'OEBPS/content.opf';
  let opf = await zip.file(opfPath)?.async('string');
  const coverHref = opf?.match(/<item id="image_cover"[^>]*\bhref="([^"]+)"/)?.[1];
  if (!opf || !coverHref) throw new Error('Generated EPUB is missing its cover image.');

  opf = opf
    .replace(/<item id="image_cover"(?![^>]*\bproperties=)/, '<item id="image_cover" properties="cover-image"')
    .replace('</manifest>', '    <item id="cover_page" href="cover.xhtml" media-type="application/xhtml+xml" properties="svg" />\n    </manifest>')
    .replace(/<spine\b[^>]*>/, (spine) => `${spine}\n        <itemref idref="cover_page" />`)
    .replace(/<guide>/, '<guide>\n        <reference type="cover" title="Cover" href="cover.xhtml"/>');
  zip.file(opfPath, opf);
  zip.file('OEBPS/cover.xhtml', coverPageXhtml(coverHref, coverSize.width, coverSize.height));

  // The EPUB format requires the "mimetype" entry to be first and uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}

async function imageSize(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

// Converts each PDF page into its own EPUB chapter: the page's text, split into paragraphs,
// with its embedded images placed among them. Page layout and vector drawings are not carried over.
// The cover is `cover` if given, otherwise the PDF's first page; it is also the book's first page.
export async function convertPdfToEpub(file: File, cover?: File): Promise<Blob> {
  const [pdfjs, epubModule, { createImageCache, extractPageImages, revokeImageUrl }, { renderPageAsCover }] = await Promise.all([
    loadPdfjs(),
    import('epub-gen-memory/bundle'),
    import('./pdfImages'),
    import('./pdfCover'),
  ]);
  // The browser bundle is CommonJS, so the generator function can end up nested under a second `default`.
  const imported = epubModule.default as EpubFn | { default: EpubFn };
  const epub = typeof imported === 'function' ? imported : imported.default;

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const imageCache = createImageCache();
  const imageUrls = new Set<string>();
  try {
    const pdf = await loadingTask.promise;
    const { info } = await pdf.getMetadata();
    const meta = info as { Title?: string; Author?: string };
    const title = meta.Title?.trim() || file.name.replace(/\.pdf$/i, '');
    const coverFile = normalizeCover(cover ?? (await renderPageAsCover(await pdf.getPage(1))));

    const chapters = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const [{ items }, images] = await Promise.all([page.getTextContent(), extractPageImages(page, imageCache)]);
      images.forEach((image) => imageUrls.add(image.url));

      const paragraphs = toParagraphs(items.filter((item): item is TextItem => 'str' in item));
      const [x0, , x1] = page.view;
      const html = pageToHtml(paragraphs, images, x1 - x0, pageNumber);
      chapters.push({ title: `Page ${pageNumber}`, content: html || '<p></p>' });
    }

    const epubBlob = await epub(
      {
        title,
        cover: coverFile,
        ...(meta.Author?.trim() && { author: meta.Author.trim() }),
        prependChapterTitles: false,
        numberChaptersInTOC: false,
      },
      chapters,
    );
    return await addCover(epubBlob, await imageSize(coverFile));
  } finally {
    imageUrls.forEach(revokeImageUrl);
    await loadingTask.destroy();
  }
}
