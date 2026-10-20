import { Camera, ImagePlus } from 'lucide-react';
import { useRef } from 'react';

/** Zwei Wege zum Bild: Kamera direkt (mobil) oder aus der Galerie/Dateien. */
export function PhotoPicker({ onPick, cameraLabel = 'Foto aufnehmen' }: { onPick: (file: File) => void; cameraLabel?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };
  return (
    <div className="grid-2">
      <button type="button" className="btn primary" onClick={() => cameraRef.current?.click()}>
        <Camera size={20} /> {cameraLabel}
      </button>
      <button type="button" className="btn" onClick={() => galleryRef.current?.click()}>
        <ImagePlus size={20} /> Aus Galerie
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handle} />
    </div>
  );
}
