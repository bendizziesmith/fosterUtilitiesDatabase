/**
 * Shrinks a photo on the phone (long side about 1600px, JPEG 0.8) and draws the date / time
 * stamp into its bottom-left corner, so the stamp stays on the picture wherever it goes.
 * Documents (PDFs) are passed through unchanged. Rules are in photoLogic.ts (tested).
 */
import { chooseTakenAt, exifTakenAt, fitWithin, isStampable, stampLayout, stampLines, TakenAtSource } from './photoLogic';

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

/** Bottom-left stamp: white text with a thin dark outline on a semi-transparent dark strip (readable on any background). */
function drawStamp(ctx: CanvasRenderingContext2D, width: number, height: number, lines: string[]) {
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  const first = stampLayout(width, height, lines.map(() => 0));
  const widths = lines.map((t, i) => {
    ctx.font = `${i === 0 ? '700' : '600'} ${i === 0 ? first.big : first.small}px ${font}`;
    return ctx.measureText(t).width;
  });
  const l = stampLayout(width, height, widths);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fillRect(l.x, l.y, l.w, l.h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  let ty = l.y + l.pad;
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? '700' : '600'} ${l.sizes[i]}px ${font}`;
    ctx.lineWidth = Math.max(2, Math.round(l.sizes[i] * 0.12));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(t, l.x + l.pad, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t, l.x + l.pad, ty);
    ty += l.sizes[i] + l.gap;
  });
}

/**
 * Ready to upload: a shrunk, stamped JPEG (or the document as it is), when it was taken and which
 * time was used: camera = when taken, library = the photo's own EXIF time, else the upload time.
 */
export async function preparePhoto(file: File, stamp: StampInfo = {}, source: 'camera' | 'library' = 'library'):
  Promise<{ blob: Blob; takenAt: Date; used: TakenAtSource; contentType: string; ext: string }> {
  const now = new Date();
  if (!isStampable(file)) {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    return { blob: file, takenAt: now, used: 'uploaded', contentType: file.type || 'application/octet-stream', ext };
  }
  let exif: Date | null = null;
  if (source === 'library') {
    try {
      exif = exifTakenAt(await file.arrayBuffer());
    } catch {
      exif = null;
    }
  }
  const { at: takenAt, used } = chooseTakenAt({ source, exif, now });
  const { img, width: w0, height: h0 } = await decode(file);
  const { width, height } = fitWithin(w0, h0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone could not prepare the photo.');
  ctx.drawImage(img, 0, 0, width, height);
  drawStamp(ctx, width, height, stampLines(takenAt, stamp.reg, stamp.site, used));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('This phone could not prepare the photo.'))), 'image/jpeg', 0.8)
  );
  return { blob, takenAt, used, contentType: 'image/jpeg', ext: 'jpg' };
}
