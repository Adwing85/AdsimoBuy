import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/** Prüfziffer für EAN-8, UPC-A (12) und EAN-13. Andere Längen gelten als gültig. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code)) return code.length >= 4;
  if (![8, 12, 13, 14].includes(code.length)) return true;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): NativeDetector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

async function nativeDetector(): Promise<NativeDetector | null> {
  if (!window.BarcodeDetector) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

/** ZXing wird erst geladen, wenn kein nativer BarcodeDetector verfügbar ist (z. B. iOS). */
async function zxingReader(): Promise<BrowserMultiFormatReader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

export interface ScannerHandle {
  stop(): void;
  /** Taschenlampe umschalten (nur wenn die Kamera das unterstützt). */
  setTorch?(on: boolean): Promise<void>;
  engine: 'native' | 'zxing';
}

/**
 * Startet die Rückkamera und meldet erkannte Codes. Nutzt den nativen BarcodeDetector
 * (Chrome/Android), sonst ZXing (z. B. Safari/iOS).
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScannerHandle> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  };
  const detector = await nativeDetector();
  let lastCode = '';
  let lastCount = 0;
  // Ein Code muss zweimal hintereinander gelesen werden, um Fehllesungen zu vermeiden.
  const report = (code: string) => {
    if (!isValidGtin(code)) return;
    if (code === lastCode) lastCount++;
    else {
      lastCode = code;
      lastCount = 1;
    }
    if (lastCount === 2) onCode(code);
  };

  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes[0]) report(codes[0].rawValue);
        }
      } catch {
        // einzelne Frames dürfen fehlschlagen
      }
      setTimeout(loop, 120);
    };
    loop();
    const track = stream.getVideoTracks()[0];
    return {
      engine: 'native',
      stop() {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      },
      setTorch: torchSetter(track),
    };
  }

  const reader = await zxingReader();
  const controls: IScannerControls = await reader.decodeFromConstraints(constraints, video, (result) => {
    if (result) report(result.getText());
  });
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  return {
    engine: 'zxing',
    stop: () => controls.stop(),
    setTorch: stream ? torchSetter(stream.getVideoTracks()[0]) : undefined,
  };
}

function torchSetter(track: MediaStreamTrack | undefined): ScannerHandle['setTorch'] {
  if (!track || typeof track.getCapabilities !== 'function') return undefined;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  if (!caps.torch) return undefined;
  return (on: boolean) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
}

/** Barcode aus einem Foto lesen (Fallback ohne Live-Kamera). */
export async function decodeBarcodeFromImage(file: Blob): Promise<string | null> {
  const detector = await nativeDetector();
  const url = URL.createObjectURL(file);
  try {
    if (detector) {
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      if (codes[0] && isValidGtin(codes[0].rawValue)) return codes[0].rawValue;
    }
    const result = await (await zxingReader()).decodeFromImageUrl(url);
    const text = result.getText();
    return isValidGtin(text) ? text : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
