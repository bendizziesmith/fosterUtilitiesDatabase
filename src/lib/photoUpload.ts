/**
 * Shrinks a photo on the phone (long side about 1600px, JPEG 0.8) and draws the date / time
 * stamp into its bottom-right corner, so the stamp stays on the picture wherever it goes.
 * Documents (PDFs) are passed through unchanged. Rules are in photoLogic.ts (tested).
 */
import { fitWithin, isStampable, stampLines, takenAtFor } from './photoLogic';

export interface StampInfo {
  reg?: string | null;
  site?: string | null;
}

async function decode(file: File): Promise<{ img: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { img: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* fall back to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This photo could not be read. Try again, or choose a JPEG.'));
      el.src = url;
    });
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawStamp(ctx: CanvasRenderingContext2D, width: number, height: number, lines: string[]) {
  const big = Math.max(18, Math.round(Math.min(width, height) * 0.045));
  const small = Math.round(big * 0.72);
  const pad = Math.round(big * 0.45);
  const gap = Math.round(big * 0.25);
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  const sizes = lines.map((_, i) => (i === 0 ? big : small));
  const widths = lines.map((t, i) => {
    ctx.font = `${i === 0 ? '700' : '600'} ${sizes[i]}px ${font}`;
    return ctx.measureText(t).width;
  });
  const boxW = Math.ceil(Math.max(...widths) + pad * 2);
  const boxH = Math.ceil(sizes.reduce((a, b) => a + b, 0) + gap * (lines.length - 1) + pad * 2);
  const margin = Math.round(big * 0.6);
  const x = width - boxW - margin;
  const y = height - boxH - margin;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.62)'; // dark, semi-transparent: reads on any background
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  let ty = y + pad;
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? '700' : '600'} ${sizes[i]}px ${font}`;
    ctx.fillText(t, x + boxW - pad, ty);
    ty += sizes[i] + gap;
  });
}

/** Ready to upload: a shrunk, stamped JPEG (or the document as it is) and when it was taken. */
export async function preparePhoto(file: File, stamp: StampInfo = {}): Promise<{ blob: Blob; takenAt: Date; contentType: string; ext: string }> {
  const takenAt = takenAtFor(file);
  if (!isStampable(file)) {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    return { blob: file, takenAt, contentType: file.type || 'application/octet-stream', ext };
  }
  const { img, width: w0, height: h0 } = await decode(file);
  const { width, height } = fitWithin(w0, h0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone could not prepare the photo.');
  ctx.drawImage(img, 0, 0, width, height);
  drawStamp(ctx, width, height, stampLines(takenAt, stamp.reg, stamp.site));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('This phone could not prepare the photo.'))), 'image/jpeg', 0.8)
  );
  return { blob, takenAt, contentType: 'image/jpeg', ext: 'jpg' };
}
