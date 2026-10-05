import { ImageKind, OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';

type Matrix = number[];

type PdfImageData = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
};

export type PageImage = {
  url: string;
  top: number;
  width: number;
};

const MIN_DISPLAY_SIZE = 16;
const OBJECT_TIMEOUT_MS = 10_000;

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function unitSquareBounds(m: Matrix) {
  const xs = [0, 1, 0, 1].map((x, i) => m[0] * x + m[2] * (i >> 1) + m[4]);
  const ys = [0, 1, 0, 1].map((x, i) => m[1] * x + m[3] * (i >> 1) + m[5]);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), top: Math.max(...ys) };
}

function getImageObject(page: PDFPageProxy, objId: string): Promise<PdfImageData | null> {
  const store = objId.startsWith('g_') ? page.commonObjs : page.objs;
  return Promise.race([
    new Promise<PdfImageData | null>((resolve) => store.get(objId, resolve)),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OBJECT_TIMEOUT_MS)),
  ]);
}

function toRgba(image: PdfImageData): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, kind, data = new Uint8Array() } = image;
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (kind === ImageKind.RGBA_32BPP) {
    rgba.set(data.subarray(0, rgba.length));
  } else if (kind === ImageKind.RGB_24BPP) {
    for (let src = 0, dest = 0; dest < rgba.length; src += 3, dest += 4) {
      rgba[dest] = data[src];
      rgba[dest + 1] = data[src + 1];
      rgba[dest + 2] = data[src + 2];
      rgba[dest + 3] = 255;
    }
  } else if (kind === ImageKind.GRAYSCALE_1BPP) {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const dest = (y * width + x) * 4;
        rgba[dest] = rgba[dest + 1] = rgba[dest + 2] = bit ? 255 : 0;
        rgba[dest + 3] = 255;
      }
    }
  } else {
    throw new Error(`Unsupported image kind: ${kind}`);
  }
  return rgba;
}

function hasTransparency(rgba: Uint8ClampedArray) {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) return true;
  }
  return false;
}

export function createImageCache() {
  return {
    byId: new Map<string, Promise<string | null>>(),
    byHash: new Map<string, string>(),
  };
}
type ImageCache = ReturnType<typeof createImageCache>;

async function blobToUrl(blob: Blob, extension: string, cache: ImageCache) {
  const hash = crypto.subtle
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('')
    : undefined;
  const existing = hash && cache.byHash.get(hash);
  if (existing) return existing;
  const url = `${URL.createObjectURL(blob)}#image.${extension}`;
  if (hash) cache.byHash.set(hash, url);
  return url;
}

async function encodeImage(image: PdfImageData, cache: ImageCache): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !image.width || !image.height) return null;

  let rgba: Uint8ClampedArray;
  if (image.bitmap) {
    ctx.drawImage(image.bitmap, 0, 0);
    rgba = ctx.getImageData(0, 0, image.width, image.height).data;
  } else {
    const pixels = toRgba(image);
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    rgba = pixels;
  }

  const [type, extension] = hasTransparency(rgba) ? ['image/png', 'png'] : ['image/jpeg', 'jpg'];
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  return blob && blobToUrl(blob, extension, cache);
}

export function revokeImageUrl(url: string) {
  URL.revokeObjectURL(url.replace(/#.*$/, ''));
}

export async function extractPageImages(
  page: PDFPageProxy,
  cache: ImageCache,
): Promise<PageImage[]> {
  const { fnArray, argsArray } = await page.getOperatorList();
  const images: PageImage[] = [];
  const seenOnPage = new Set<string>();
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < fnArray.length; i++) {
    const args = argsArray[i];
    switch (fnArray[i]) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (args[0]) ctm = multiply(ctm, args[0]);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject: {
        const bounds = unitSquareBounds(ctm);
        if (bounds.width < MIN_DISPLAY_SIZE || bounds.height < MIN_DISPLAY_SIZE) break;

        let url: string | null;
        if (fnArray[i] === OPS.paintImageXObject) {
          const objId: string = args[0];
          if (seenOnPage.has(objId)) break;
          seenOnPage.add(objId);
          if (!cache.byId.has(objId)) {
            cache.byId.set(objId, getImageObject(page, objId).then((image) => (image ? encodeImage(image, cache) : null)));
          }
          url = await cache.byId.get(objId)!;
        } else {
          url = await encodeImage(args[0], cache);
        }
        if (url) images.push({ url, top: bounds.top, width: bounds.width });
        break;
      }
    }
  }
  return images;
}
