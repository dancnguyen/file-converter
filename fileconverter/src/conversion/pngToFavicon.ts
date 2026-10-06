const ICON_SIZES = [16, 32, 48];
const WORKING_SIZE = 512;
const BACKGROUND_TOLERANCE = 40;

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create a drawing canvas.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

type Rect = { x: number; y: number; width: number; height: number };

function toSquare(source: CanvasImageSource, width: number, height: number) {
  const side = Math.min(Math.max(width, height), WORKING_SIZE);
  const scale = side / Math.max(width, height);
  const area: Rect = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), x: 0, y: 0 };
  area.x = Math.floor((side - area.width) / 2);
  area.y = Math.floor((side - area.height) / 2);
  const { canvas, ctx } = createCanvas(side, side);
  ctx.drawImage(source, area.x, area.y, area.width, area.height);
  return { canvas, area };
}

function fillPadding(canvas: HTMLCanvasElement, area: Rect) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const background = findBackgroundColor(ctx.getImageData(0, 0, canvas.width, canvas.width).data, canvas.width, area);
  if (!background) return;
  ctx.fillStyle = `rgb(${background.join(',')})`;
  ctx.fillRect(0, 0, canvas.width, area.y);
  ctx.fillRect(0, area.y + area.height, canvas.width, canvas.width - area.y - area.height);
  ctx.fillRect(0, area.y, area.x, area.height);
  ctx.fillRect(area.x + area.width, area.y, canvas.width - area.x - area.width, area.height);
}

function resize(source: HTMLCanvasElement, size: number) {
  let current = source;
  while (current.width / 2 >= size) {
    const half = Math.floor(current.width / 2);
    const { canvas, ctx } = createCanvas(half, half);
    ctx.drawImage(current, 0, 0, half, half);
    current = canvas;
  }
  const { canvas, ctx } = createCanvas(size, size);
  ctx.drawImage(current, 0, 0, size, size);
  return canvas;
}

function colorDistance(data: Uint8ClampedArray, i: number, [r, g, b]: number[]) {
  return Math.sqrt((data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2);
}

function findBackgroundColor(data: Uint8ClampedArray, side: number, area: Rect): number[] | null {
  let transparent = 0;
  const counts = new Map<number, { count: number; color: number[] }>();
  const visit = (x: number, y: number) => {
    const i = (y * side + x) * 4;
    if (data[i + 3] < 128) {
      transparent++;
      return;
    }
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const entry = counts.get(key) ?? { count: 0, color: [data[i], data[i + 1], data[i + 2]] };
    entry.count++;
    counts.set(key, entry);
  };
  const right = area.x + area.width - 1;
  const bottom = area.y + area.height - 1;
  for (let x = area.x; x <= right; x++) {
    visit(x, area.y);
    visit(x, bottom);
  }
  for (let y = area.y; y <= bottom; y++) {
    visit(area.x, y);
    visit(right, y);
  }
  let best: { count: number; color: number[] } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return best && best.count > transparent ? best.color : null;
}

function removeBackground(canvas: HTMLCanvasElement, area: Rect) {
  const side = canvas.width;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, side, side);
  const { data } = image;
  const background = findBackgroundColor(data, side, area);
  if (!background) return;

  const isBackground = (p: number) => data[p * 4 + 3] === 0 || colorDistance(data, p * 4, background) <= BACKGROUND_TOLERANCE;
  const removed = new Uint8Array(side * side);
  const stack: number[] = [];
  for (let n = 0; n < side; n++) {
    stack.push(n, (side - 1) * side + n, n * side, n * side + side - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    if (removed[p] || !isBackground(p)) continue;
    removed[p] = 1;
    const x = p % side;
    if (x > 0) stack.push(p - 1);
    if (x < side - 1) stack.push(p + 1);
    if (p >= side) stack.push(p - side);
    if (p < side * (side - 1)) stack.push(p + side);
  }

  for (let p = 0; p < removed.length; p++) {
    const i = p * 4;
    if (removed[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % side;
    const touchesRemoved =
      (x > 0 && removed[p - 1]) || (x < side - 1 && removed[p + 1]) || (p >= side && removed[p - side]) || (p < side * (side - 1) && removed[p + side]);
    if (touchesRemoved) {
      const fade = Math.min(1, (colorDistance(data, i, background) - BACKGROUND_TOLERANCE) / BACKGROUND_TOLERANCE);
      data[i + 3] = Math.round(data[i + 3] * fade);
    }
  }
  ctx.putImageData(image, 0, 0);
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<ArrayBuffer>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob.arrayBuffer()) : reject(new Error('Could not encode the icon image.'))), 'image/png'),
  );
}

function buildIco(images: { size: number; png: ArrayBuffer }[]) {
  const headerSize = 6 + images.length * 16;
  const totalSize = headerSize + images.reduce((sum, { png }) => sum + png.byteLength, 0);
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    view.setUint8(entry, size >= 256 ? 0 : size);
    view.setUint8(entry + 1, size >= 256 ? 0 : size);
    view.setUint8(entry + 2, 0);
    view.setUint8(entry + 3, 0);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(new Uint8Array(png), offset);
    offset += png.byteLength;
  });
  return new Blob([bytes], { type: 'image/x-icon' });
}

export async function convertPngToFavicon(file: File, transparentBackground: boolean): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('The file could not be read as a PNG image.');
  }
  try {
    const { canvas: square, area } = toSquare(bitmap, bitmap.width, bitmap.height);
    if (transparentBackground) removeBackground(square, area);
    else fillPadding(square, area);
    const images = await Promise.all(ICON_SIZES.map(async (size) => ({ size, png: await canvasToPng(resize(square, size)) })));
    return buildIco(images);
  } finally {
    bitmap.close();
  }
}
