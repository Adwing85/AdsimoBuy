import { createWorker, PSM } from 'tesseract.js';
import { preprocessForOcr } from './image';

export type OcrKind = 'list' | 'receipt';

/**
 * Offline-Texterkennung mit Tesseract (deutsches Sprachmodell).
 * Beim ersten Aufruf werden Engine und Sprachdaten (~10 MB) geladen und danach vom Service Worker gecacht.
 */
export async function recognizeText(
  image: Blob,
  kind: OcrKind,
  onProgress?: (progress: number, status: string) => void,
): Promise<string> {
  onProgress?.(0, 'Bild wird vorbereitet …');
  const canvas = await preprocessForOcr(image, { binarize: kind === 'receipt' });
  const worker = await createWorker('deu', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(0.2 + m.progress * 0.8, 'Text wird erkannt …');
      else if (m.status.startsWith('loading')) onProgress?.(0.05 + m.progress * 0.15, 'Texterkennung wird geladen …');
    },
  });
  try {
    await worker.setParameters({
      // Kassenbons: eine Spalte mit festen Zeilen; Einkaufszettel: Block-Erkennung.
      tessedit_pageseg_mode: kind === 'receipt' ? PSM.SINGLE_COLUMN : PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(canvas);
    onProgress?.(1, 'Fertig');
    return data.text;
  } finally {
    await worker.terminate();
  }
}
