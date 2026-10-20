/** Lädt ein Bild (File/Blob) als ImageBitmap bzw. HTMLImageElement. */
async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fallback unten (z. B. HEIC in älteren Browsern)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(source: ImageBitmap | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality),
  );
}

/** Verkleinert ein Foto (z. B. zum Speichern eines Bons oder für die KI-Erkennung). */
export async function resizeImage(blob: Blob, maxSide = 2000, quality = 0.85): Promise<Blob> {
  const bitmap = await loadBitmap(blob);
  return canvasToBlob(drawScaled(bitmap, maxSide), 'image/jpeg', quality);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Otsu-Schwellwert für ein Graustufen-Histogramm. */
function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Bereitet ein Foto für die Texterkennung vor: Graustufen, Kontrast strecken,
 * optional Binarisierung (für Kassenbons mit Thermodruck sinnvoll).
 */
export async function preprocessForOcr(blob: Blob, opts: { binarize: boolean }): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(blob);
  const canvas = drawScaled(bitmap, 2400);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[j] = g;
    hist[g]++;
  }
  // 1 %/99 %-Perzentile für robuste Kontraststreckung.
  const total = gray.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > total * 0.01) {
      lo = i;
      break;
    }
  }
  for (let acc = 0, i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc > total * 0.01) {
      hi = i;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  const stretched = new Uint32Array(256);
  for (let j = 0; j < total; j++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[j] - lo) * 255) / range)));
    gray[j] = v;
    stretched[v]++;
  }
  const threshold = opts.binarize ? otsuThreshold(stretched, total) : -1;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = threshold >= 0 ? (gray[j] > threshold ? 255 : 0) : gray[j];
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
