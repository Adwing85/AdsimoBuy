import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { CATEGORIES, CATEGORY_IDS, classifyByKeywords, isCategoryId, type CategoryId } from '../domain/categories';
import { blobToBase64, resizeImage } from './image';

const MODEL = 'claude-opus-5-5';

const CATEGORY_HINT = CATEGORY_IDS.map((id) => `${id} = ${CATEGORIES[id].label}`).join('\n');

// Enum-Felder werden als Text angenommen und danach normalisiert: Die Schema-Umwandlung des SDK
// setzt Enums nur als Beschreibung, nicht als harte Einschränkung.
const categoryField = z.string().describe(`Kategorie-ID, genau eine von: ${CATEGORY_IDS.join(', ')}`);

function toCategory(value: string, name: string): CategoryId {
  const v = value.trim().toLowerCase();
  if (isCategoryId(v)) return v;
  const byLabel = CATEGORY_IDS.find((id) => CATEGORIES[id].label.toLowerCase() === v);
  return byLabel ?? classifyByKeywords(name) ?? 'sonstiges';
}

const ListSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Artikelname, Anfangsbuchstabe groß, Rechtschreibung korrigiert'),
      quantity: z.string().nullable().describe('Menge wie notiert, z. B. "2×", "500 g", "1 Bund"; null wenn keine'),
      category: categoryField,
    }),
  ),
});

const ReceiptSchema = z.object({
  store: z.string().nullable().describe('Name des Marktes bzw. der Kette, z. B. "Lidl"'),
  date: z.string().nullable().describe('Kaufdatum als YYYY-MM-DD'),
  total: z.number().nullable().describe('Zu zahlender Gesamtbetrag in Euro'),
  items: z.array(
    z.object({
      name: z.string().describe('Artikelbezeichnung exakt wie auf dem Bon'),
      quantity: z.number().describe('Stückzahl oder Gewicht in kg'),
      unit: z.string().describe('"stk" für Stückartikel, "kg" für gewogene Ware'),
      unitPrice: z.number().describe('Preis pro Stück bzw. pro kg'),
      totalPrice: z.number().describe('Tatsächlich bezahlter Betrag inkl. verrechneter Rabatte'),
      kind: z.string().describe('"item" für Artikel, "deposit" für Pfand oder Leergutrückgabe'),
      category: categoryField,
      matchedProductId: z
        .number()
        .nullable()
        .describe('ID eines bekannten Produkts, wenn der Bon-Artikel eindeutig dazu passt, sonst null'),
    }),
  ),
});

export interface AiListResult {
  items: Array<{ name: string; quantity: string | null; category: CategoryId }>;
}

export interface AiReceiptResult {
  store: string | null;
  date: string | null;
  total: number | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: 'stk' | 'kg';
    unitPrice: number;
    totalPrice: number;
    kind: 'item' | 'deposit';
    category: CategoryId;
    matchedProductId: number | null;
  }>;
}

export class AiError extends Error {}

function client(apiKey: string): Anthropic {
  // Die App läuft ohne eigenen Server: Der Schlüssel des Nutzers bleibt lokal auf dem Gerät
  // und wird nur direkt an die Anthropic-API gesendet.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

async function imageBlock(image: Blob) {
  const jpeg = await resizeImage(image, 2000, 0.88);
  return {
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: await blobToBase64(jpeg) },
  };
}

function translateError(err: unknown): never {
  if (err instanceof AiError) throw err;
  if (err instanceof Anthropic.AuthenticationError) throw new AiError('Der API-Schlüssel ist ungültig.');
  if (err instanceof Anthropic.PermissionDeniedError) throw new AiError('Der API-Schlüssel hat keinen Zugriff auf dieses Modell.');
  if (err instanceof Anthropic.RateLimitError) throw new AiError('Zu viele Anfragen – bitte kurz warten und erneut versuchen.');
  if (err instanceof Anthropic.BadRequestError) throw new AiError(`Anfrage abgelehnt: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) throw new AiError('Keine Verbindung zur KI – bist du online?');
  if (err instanceof Anthropic.APIError) throw new AiError(`KI-Fehler (${err.status ?? '?'}): ${err.message}`);
  throw err instanceof Error ? err : new AiError(String(err));
}

async function run<T>(
  apiKey: string,
  schema: z.ZodType<T>,
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<T> {
  try {
    const response = await client(apiKey).beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Falls das Modell eine Anfrage aus Richtlinien-Gründen ablehnt, übernimmt serverseitig ein Ersatzmodell.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') throw new AiError('Die KI hat die Anfrage abgelehnt.');
    if (response.stop_reason === 'max_tokens') throw new AiError('Die Antwort war zu lang – bitte einen kleineren Ausschnitt fotografieren.');
    if (!response.parsed_output) throw new AiError('Die KI-Antwort konnte nicht gelesen werden.');
    return response.parsed_output;
  } catch (err) {
    translateError(err);
  }
}

/** Erkennt einen (auch handschriftlichen) Einkaufszettel. */
export async function extractListWithAi(apiKey: string, image: Blob): Promise<AiListResult> {
  const result = await run(
    apiKey,
    ListSchema,
    `Du liest Fotos von Einkaufszetteln (handschriftlich, gedruckt oder Bildschirmfotos) und gibst jeden Artikel einzeln zurück.
Ignoriere durchgestrichene Einträge, Überschriften, Datumsangaben und Notizen, die keine Artikel sind.
Ordne jedem Artikel die Supermarkt-Kategorie zu, in der man ihn in einem deutschen Supermarkt findet:
${CATEGORY_HINT}`,
    [await imageBlock(image), { type: 'text', text: 'Bitte alle Artikel dieses Einkaufszettels extrahieren.' }],
  );
  return { items: result.items.map((i) => ({ ...i, category: toCategory(i.category, i.name) })) };
}

/** Liest einen Kassenbon und ordnet Positionen bekannten Produkten zu. */
export async function extractReceiptWithAi(
  apiKey: string,
  image: Blob,
  knownProducts: ReadonlyArray<{ id: number; name: string; brand?: string; aliases: string[] }>,
): Promise<AiReceiptResult> {
  const catalog = knownProducts
    .slice(0, 400)
    .map((p) => `${p.id}: ${p.brand ? `${p.brand} ` : ''}${p.name}${p.aliases.length ? ` (Bon: ${p.aliases.slice(0, 3).join(' | ')})` : ''}`)
    .join('\n');
  const result = await run(
    apiKey,
    ReceiptSchema,
    `Du liest Fotos deutscher Kassenbons und gibst die gekauften Positionen strukturiert zurück.
Regeln:
- Jede Position einmal; Mengenzeilen wie "2 x 0,99" oder Gewichtszeilen wie "0,512 kg x 3,99 EUR/kg" gehören zur zugehörigen Position.
- Rabatte (z. B. "Lidl Plus Rabatt", "Preisvorteil") mit der betroffenen Position verrechnen, nicht als eigene Position.
- Pfand und Leergut als kind "deposit" (Leergutrückgabe mit negativem Betrag).
- Summen-, Zahlungs-, Steuer- und Kopfzeilen sind keine Positionen.
- matchedProductId nur setzen, wenn die Position eindeutig einem der bekannten Produkte entspricht.
Kategorien:
${CATEGORY_HINT}`,
    [
      await imageBlock(image),
      {
        type: 'text',
        text: `Bekannte Produkte (ID: Name):\n${catalog || '(noch keine)'}\n\nBitte diesen Kassenbon auslesen.`,
      },
    ],
  );
  return {
    ...result,
    items: result.items.map((i) => {
      const unit: 'stk' | 'kg' = i.unit.trim().toLowerCase() === 'kg' ? 'kg' : 'stk';
      const quantity = i.quantity > 0 ? i.quantity : 1;
      return {
        ...i,
        unit,
        quantity,
        unitPrice: i.unitPrice || i.totalPrice / quantity,
        kind: /deposit|pfand|leergut/i.test(i.kind) ? 'deposit' : 'item',
        category: toCategory(i.category, i.name),
      };
    }),
  };
}

/** Prüft, ob ein Schlüssel funktioniert (kleine Testanfrage). */
export async function testApiKey(apiKey: string): Promise<void> {
  try {
    await client(apiKey).messages.create({
      model: MODEL,
      max_tokens: 16,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Antworte nur mit OK.' }],
    });
  } catch (err) {
    translateError(err);
  }
}
