import { useLiveQuery } from 'dexie-react-hooks';
import { ChefHat, Loader2, Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { addItems, markRecipeUsed, saveRecipe, setSetting } from '../db/repo';
import type { Recipe } from '../db/types';
import { CATEGORIES } from '../domain/categories';
import { clampServings, formatAmount, scaleIngredient, type Ingredient } from '../domain/recipes';
import { resizeImage } from '../services/image';
import { Progress, Sheet } from './common';
import { PhotoPicker } from './PhotoPicker';

interface Row {
  key: number;
  include: boolean;
  ingredient: Ingredient;
}

type Step = { kind: 'pick' } | { kind: 'busy'; status: string } | { kind: 'review' };

function ServingsStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="row" style={{ gap: 6 }} role="group" aria-label="Portionen">
      <button type="button" className="icon-btn filled" aria-label="Weniger Portionen" disabled={value <= 1} onClick={() => onChange(clampServings(value - 1))}>
        <Minus size={18} />
      </button>
      <strong className="num" style={{ minWidth: 92, textAlign: 'center' }}>
        {value} {value === 1 ? 'Portion' : 'Portionen'}
      </strong>
      <button type="button" className="icon-btn filled" aria-label="Mehr Portionen" disabled={value >= 50} onClick={() => onChange(clampServings(value + 1))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

function RecipeThumb({ recipe }: { recipe: Recipe }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!recipe.image) return;
    const u = URL.createObjectURL(recipe.image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [recipe.image]);
  return (
    <div className="thumb" aria-hidden="true">
      {url ? <img src={url} alt="" style={{ objectFit: 'cover' }} /> : '🍽️'}
    </div>
  );
}

/** Gericht fotografieren oder benennen → Zutaten für die gewünschten Portionen auf die Liste. */
export function DishImport({
  listId,
  apiKey,
  defaultServings,
  onClose,
  onDone,
}: {
  listId: number;
  apiKey?: string;
  defaultServings: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray()) ?? [];
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [servings, setServingsState] = useState(clampServings(defaultServings));
  const [preview, setPreview] = useState<string | null>(null);
  const [dish, setDish] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [baseServings, setBaseServings] = useState(4);
  const [rows, setRows] = useState<Row[]>([]);
  const [recipeId, setRecipeId] = useState<number | undefined>();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const setServings = (n: number) => {
    setServingsState(n);
    setSetting('servings', n);
  };

  const openRecipe = (recipe: Recipe, keepPreview = false) => {
    setRecipeId(recipe.id);
    setDish(recipe.name);
    setNotes(recipe.notes ?? null);
    setBaseServings(recipe.baseServings);
    setRows(recipe.ingredients.map((ingredient, key) => ({ key, include: !ingredient.pantry, ingredient })));
    if (!keepPreview) setPreview(null);
    setStep({ kind: 'review' });
  };

  const recognize = async (input: { image?: File; text?: string }) => {
    if (!apiKey) return;
    setError(null);
    if (input.image) setPreview(URL.createObjectURL(input.image));
    setStep({ kind: 'busy', status: input.image ? 'KI erkennt das Gericht …' : 'KI stellt die Zutaten zusammen …' });
    try {
      const { extractDishWithAi } = await import('../services/ai');
      const result = await extractDishWithAi(apiKey, input, servings);
      if (!result.recognized || result.ingredients.length === 0) {
        setError('Kein Gericht erkannt. Versuche ein anderes Foto oder tippe den Namen des Gerichts ein.');
        setStep({ kind: 'pick' });
        return;
      }
      // Gleich speichern, damit das Gericht später ohne erneuten KI-Aufruf verfügbar ist.
      const id = await saveRecipe({
        name: result.dish || input.text?.trim() || 'Gericht',
        baseServings: result.baseServings,
        ingredients: result.ingredients,
        notes: result.notes ?? undefined,
        image: input.image ? await resizeImage(input.image, 320, 0.7) : undefined,
        source: input.image ? 'photo' : 'text',
      });
      const saved = await db.recipes.get(id);
      if (saved) openRecipe(saved, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: 'pick' });
    }
  };

  const scaled = useMemo(
    () => rows.map((r) => ({ ...r, quantity: formatAmount(scaleIngredient(r.ingredient, baseServings, servings)) })),
    [rows, baseServings, servings],
  );
  const selected = scaled.filter((r) => r.include);

  const addToList = async () => {
    const name = dish.trim() || 'Gericht';
    const added = await addItems(
      listId,
      selected.map((r) => ({
        name: r.ingredient.name,
        quantity: r.quantity,
        category: r.ingredient.category,
        note: `für ${name}`,
        source: 'recipe' as const,
      })),
    );
    if (recipeId) {
      const recipe = await db.recipes.get(recipeId);
      if (recipe && recipe.name !== name) await db.recipes.update(recipeId, { name });
      await markRecipeUsed(recipeId);
    }
    const skipped = selected.length - added;
    onDone(`${added} Zutaten für ${name} hinzugefügt${skipped ? ` · ${skipped} standen schon auf der Liste` : ''}`);
  };

  return (
    <Sheet title="Gericht → Einkauf" onClose={onClose}>
      <div className="stack">
        {step.kind === 'pick' && (
          <>
            <p className="small text-2" style={{ margin: 0 }}>
              Fotografiere ein Gericht, eine Rezeptseite oder einen Rezept-Screenshot – oder tippe einfach den Namen ein. Die Zutaten werden für deine
              Portionen berechnet.
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small text-2">Kochen für</span>
              <ServingsStepper value={servings} onChange={setServings} />
            </div>
            {error && <div className="notice error">{error}</div>}
            {apiKey ? (
              <>
                <PhotoPicker onPick={(file) => recognize({ image: file })} cameraLabel="Foto machen" />
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (query.trim()) recognize({ text: query });
                  }}
                >
                  <input
                    className="input grow"
                    placeholder="oder Gericht eintippen, z. B. Lasagne"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Name des Gerichts"
                  />
                  <button className="btn soft" type="submit" disabled={!query.trim()}>
                    <Sparkles size={18} /> Zutaten
                  </button>
                </form>
                <div className="tiny muted">Foto bzw. Name werden zur Erkennung an die KI (Anthropic) gesendet.</div>
              </>
            ) : (
              <div className="notice warn small">
                <span>
                  Für das Erkennen von Gerichten braucht die App die KI-Erkennung. Hinterlege deinen Anthropic-Schlüssel unter{' '}
                  <a href="#/settings" onClick={onClose}>
                    Mehr → Texterkennung
                  </a>
                  . Gespeicherte Gerichte unten funktionieren auch ohne.
                </span>
              </div>
            )}

            {recipes.length > 0 && (
              <>
                <div className="section-title">
                  <ChefHat size={14} /> Deine Gerichte
                </div>
                <div className="card">
                  {recipes.map((r) => (
                    <div key={r.id} className="list-row" style={{ cursor: 'default' }}>
                      <button
                        className="row grow"
                        style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                        onClick={() => openRecipe(r)}
                      >
                        <RecipeThumb recipe={r} />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="item-name ellipsis" style={{ display: 'block' }}>
                            {r.name}
                          </span>
                          <span className="tiny muted">
                            {r.ingredients.length} Zutaten{r.usedCount ? ` · ${r.usedCount}× gekocht` : ''}
                          </span>
                        </span>
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`${r.name} löschen`}
                        onClick={() => {
                          if (r.id && confirm(`„${r.name}“ aus deinen Gerichten löschen?`)) db.recipes.delete(r.id);
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step.kind === 'busy' && (
          <div className="stack" style={{ padding: '12px 0' }}>
            {preview && <img className="photo-preview" src={preview} alt="Fotografiertes Gericht" />}
            <div className="row">
              <Loader2 className="spin" size={20} /> {step.status}
            </div>
            <Progress value={0.5} />
          </div>
        )}

        {step.kind === 'review' && (
          <>
            {preview && <img className="photo-preview" src={preview} alt="Fotografiertes Gericht" />}
            <label className="field">
              Gericht
              <input className="input" value={dish} onChange={(e) => setDish(e.target.value)} />
            </label>
            <div className="card card-pad row" style={{ justifyContent: 'space-between' }}>
              <span className="small text-2">Kochen für</span>
              <ServingsStepper value={servings} onChange={setServings} />
            </div>
            {notes && <div className="notice small">{notes}</div>}
            {baseServings !== servings && (
              <div className="tiny muted">
                Mengen umgerechnet von {baseServings} auf {servings} Portionen, aufgerundet auf einkaufbare Größen.
              </div>
            )}
            <div className="card">
              {scaled.map((r) => (
                <label key={r.key} className="list-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, include: e.target.checked } : x)))}
                    style={{ width: 22, height: 22, flex: 'none' }}
                  />
                  <span aria-hidden="true">{CATEGORIES[r.ingredient.category].icon}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="item-name" style={{ opacity: r.include ? 1 : 0.55 }}>
                      {r.ingredient.name}
                    </span>
                    {r.ingredient.pantry && (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        Vorrat?
                      </span>
                    )}
                  </span>
                  <strong className="num small" style={{ whiteSpace: 'nowrap' }}>
                    {r.quantity ?? 'nach Bedarf'}
                  </strong>
                </label>
              ))}
            </div>
            <div className="grid-2">
              <button className="btn" onClick={() => setStep({ kind: 'pick' })}>
                Zurück
              </button>
              <button className="btn primary" disabled={selected.length === 0} onClick={addToList}>
                {selected.length} auf die Liste
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
