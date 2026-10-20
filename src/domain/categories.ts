import { normalize } from './text';

export const CATEGORY_IDS = [
  'obst_gemuese',
  'backwaren',
  'convenience',
  'molkerei',
  'kaese',
  'fleisch_wurst',
  'fisch',
  'tiefkuehl',
  'grundnahrung',
  'konserven',
  'backzutaten',
  'fruehstueck',
  'gewuerze',
  'kaffee_tee',
  'suesswaren',
  'getraenke',
  'alkohol',
  'drogerie',
  'haushalt',
  'baby',
  'tier',
  'nonfood',
  'sonstiges',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryInfo {
  label: string;
  icon: string;
}

export const CATEGORIES: Record<CategoryId, CategoryInfo> = {
  obst_gemuese: { label: 'Obst & Gemüse', icon: '🥦' },
  backwaren: { label: 'Brot & Backwaren', icon: '🥖' },
  convenience: { label: 'Convenience & Frischetheke', icon: '🥗' },
  molkerei: { label: 'Milch, Molkerei & Eier', icon: '🥛' },
  kaese: { label: 'Käse', icon: '🧀' },
  fleisch_wurst: { label: 'Fleisch & Wurst', icon: '🥩' },
  fisch: { label: 'Fisch & Meeresfrüchte', icon: '🐟' },
  tiefkuehl: { label: 'Tiefkühl', icon: '🧊' },
  grundnahrung: { label: 'Nudeln, Reis & Hülsenfrüchte', icon: '🍝' },
  konserven: { label: 'Konserven & Fertiggerichte', icon: '🥫' },
  backzutaten: { label: 'Backen & Mehl', icon: '🧁' },
  fruehstueck: { label: 'Frühstück & Aufstriche', icon: '🥣' },
  gewuerze: { label: 'Gewürze, Öle & Saucen', icon: '🧂' },
  kaffee_tee: { label: 'Kaffee & Tee', icon: '☕' },
  suesswaren: { label: 'Süßwaren & Snacks', icon: '🍫' },
  getraenke: { label: 'Getränke', icon: '🥤' },
  alkohol: { label: 'Bier, Wein & Spirituosen', icon: '🍷' },
  drogerie: { label: 'Drogerie & Hygiene', icon: '🧴' },
  haushalt: { label: 'Haushalt & Reinigung', icon: '🧽' },
  baby: { label: 'Baby', icon: '🍼' },
  tier: { label: 'Tierbedarf', icon: '🐾' },
  nonfood: { label: 'Aktionsware & Non-Food', icon: '🏷️' },
  sonstiges: { label: 'Sonstiges', icon: '🛒' },
};

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

/**
 * Stichwörter je Kategorie (bereits normalisiert: Umlaute ausgeschrieben).
 * Ein vorangestelltes "=" bedeutet: nur als ganzes Wort werten (z. B. "ei", "tk", "gin").
 */
const KEYWORDS: Record<CategoryId, string[]> = {
  obst_gemuese: [
    'obst', 'gemuese', 'apfel', 'aepfel', 'banane', 'birne', 'orange', 'mandarine', 'clementine',
    'zitrone', 'limette', 'traube', 'trauben', 'erdbeer', 'himbeer', 'heidelbeer', 'blaubeer', 'beeren',
    'kiwi', 'mango', 'ananas', 'melone', 'pfirsich', 'nektarine', 'pflaume', 'kirsche', 'avocado',
    'tomate', 'tomaten', 'gurke', 'paprika', 'salat', 'eisberg', 'rucola', 'feldsalat', 'spinat',
    'kartoffel', 'kartoffeln', 'suesskartoffel', 'zwiebel', 'zwiebeln', 'knoblauch', 'karotte', 'karotten',
    'moehre', 'moehren', 'zucchini', 'aubergine', 'brokkoli', 'broccoli', 'blumenkohl', 'kohl', 'kohlrabi',
    'lauch', 'porree', 'sellerie', 'champignon', 'champignons', 'pilze', 'radieschen', 'ingwer',
    'kraeuter', 'petersilie', 'schnittlauch', 'basilikum', 'dill', 'fenchel', 'spargel', 'kuerbis',
    'rote bete', 'granatapfel', 'feige', 'lauchzwiebel', 'fruehlingszwiebel', 'mais kolben', 'rhabarber',
  ],
  backwaren: [
    'brot', 'broetchen', 'semmel', 'baguette', 'toast', 'croissant', 'brezel', 'laugen', 'ciabatta',
    'kuchen', 'berliner', 'krapfen', 'donut', 'knaeckebrot', 'wrap', 'wraps', 'tortilla', 'fladenbrot',
    'zwieback', 'buttertoast', 'baeckerei', 'vollkornbrot', 'mischbrot', 'roggenbrot', 'zopf',
  ],
  convenience: [
    'fertigsalat', 'nudelsalat', 'kartoffelsalat', 'eiersalat', 'thunfischsalat', 'salatmix', 'salatschale',
    'sandwich', 'smoothie', 'hummus', 'tortellini', 'gnocchi', 'maultaschen', 'spaetzle', 'frische nudeln',
    'obstsalat', 'rohkost', 'bowl', 'snackbox', 'antipasti', 'pizzateig', 'blaetterteig', 'flammkuchenteig',
  ],
  molkerei: [
    'milch', 'vollmilch', 'frischmilch', 'joghurt', 'jogurt', 'quark', 'sahne', 'schlagsahne', 'schmand',
    'creme fraiche', 'butter', 'margarine', 'kefir', 'buttermilch', 'skyr', 'pudding', '=ei', '=eier',
    'milchreis', 'hafermilch', 'sojamilch', 'mandelmilch', 'ayran', 'dickmilch', 'saure sahne',
  ],
  kaese: [
    'kaese', 'gouda', 'emmentaler', 'mozzarella', 'feta', 'parmesan', 'camembert', 'brie', 'frischkaese',
    'hirtenkaese', 'halloumi', 'mascarpone', 'ricotta', 'cheddar', 'grana padano', 'raclette',
    'schafskaese', 'bergkaese', 'reibekaese', 'gorgonzola', 'butterkaese', 'tilsiter',
  ],
  fleisch_wurst: [
    'fleisch', 'hack', 'hackfleisch', 'haehnchen', 'huhn', 'haehnchenbrust', 'pute', 'putenbrust', 'rind',
    'rinder', 'schwein', 'schnitzel', 'steak', 'wurst', 'salami', 'schinken', 'speck', 'bacon', 'wiener',
    'wuerstchen', 'bratwurst', 'leberwurst', 'mortadella', 'lyoner', 'kassler', 'gulasch', 'frikadelle',
    'aufschnitt', 'cevapcici', 'geschnetzeltes', 'chicken', 'lamm', 'mett', 'leberkaese', 'chorizo',
    'kochschinken', 'putenaufschnitt', 'haehnchenschenkel', 'minutensteak', 'burger patties',
  ],
  fisch: [
    'fisch', 'lachs', 'forelle', 'garnelen', 'shrimps', 'hering', 'matjes', 'seelachs', 'kabeljau',
    'makrele', 'dorade', 'pangasius', 'scampi', 'rollmops', 'surimi', 'fischfilet', 'raeucherlachs',
    'meeresfruechte', 'muscheln', 'tintenfisch', 'zander',
  ],
  tiefkuehl: [
    '=tk', 'tiefkuehl', 'tiefgekuehlt', 'gefroren', 'eis', 'eiscreme', 'speiseeis', 'pizza', 'pommes',
    'fischstaebchen', 'kroketten', 'eiswuerfel', 'rahmspinat', 'gemuesepfanne', 'nuggets', 'ofenbaguette',
    'tiefkuehlpizza', 'kaiserschmarrn', 'germknoedel', 'wedges', 'rahmgemuese', 'eis am stiel',
  ],
  grundnahrung: [
    'nudeln', 'pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'tagliatelle', 'lasagne',
    'lasagneplatten', 'makkaroni', 'reis', 'basmati', 'jasminreis', 'couscous', 'bulgur', 'quinoa',
    'linsen', 'kichererbsen', 'polenta', 'kartoffelpueree', 'kartoffelpuerree', 'hirse', 'graupen',
    'semmelbroesel', 'paniermehl', 'risotto', 'mie nudeln', 'glasnudeln', 'reisnudeln',
  ],
  konserven: [
    'dose', 'dosen', 'konserve', 'konserven', 'passierte', 'passiert', 'passata', 'tomatenmark',
    'gehackte tomaten', 'mais', 'bohnen', 'kidneybohnen', 'weisse bohnen', 'erbsen', 'thunfisch', 'sardinen',
    'ravioli', 'eintopf', 'suppe', 'sauerkraut', 'rotkohl', 'oliven', 'fertiggericht', 'gewuerzgurken',
    'cornichons', 'kapern', 'kokosmilch', 'champignons dose', 'ananas dose', 'pfirsiche dose',
    'apfelmus', 'tomatenstuecke', 'baked beans',
  ],
  backzutaten: [
    'mehl', 'weizenmehl', 'dinkelmehl', 'zucker', 'backpulver', 'hefe', 'trockenhefe', 'vanillezucker',
    'puderzucker', 'speisestaerke', 'staerke', 'backkakao', 'schokotropfen', 'kuvertuere', 'gelatine',
    'gemahlene', 'tortenguss', 'backmischung', 'sahnesteif', 'rohrzucker', 'mandeln gemahlen',
    'haselnuesse gemahlen', 'natron', 'zuckerstreusel', 'kokosraspeln', 'rosinen',
  ],
  fruehstueck: [
    'muesli', 'musli', 'cornflakes', 'cerealien', 'haferflocken', 'marmelade', 'konfituere', 'honig',
    'nutella', 'nuss nougat', 'aufstrich', 'brotaufstrich', 'erdnussbutter', 'sirup', 'porridge',
    'granola', 'ahornsirup', 'gelee', 'schokomuesli', 'knuspermuesli',
  ],
  gewuerze: [
    'salz', 'pfeffer', 'gewuerz', 'gewuerze', 'paprikapulver', 'curry', 'zimt', 'oel', 'olivenoel',
    'rapsoel', 'sonnenblumenoel', 'essig', 'balsamico', 'ketchup', 'senf', 'mayo', 'mayonnaise', 'sauce',
    'sosse', 'sossen', 'pesto', 'bruehe', 'gemuesebruehe', 'bouillon', 'sojasauce', 'dressing',
    'remoulade', 'tabasco', 'oregano', 'chili', 'maggi', '=fix', 'grillsauce', 'tomatensauce',
    'currypaste', 'muskat', 'thymian', 'rosmarin', 'knoblauchpulver', 'kraeutersalz',
  ],
  kaffee_tee: [
    'kaffee', 'kaffeebohnen', 'espresso', 'tee', 'teebeutel', 'cappuccino', 'kaffeepads', 'kapseln',
    'kakao', 'kakaopulver', 'kaffeekapseln', 'instantkaffee', 'filterkaffee', 'gruentee', 'pfefferminztee',
    'kraeutertee', 'chai', 'latte macchiato', 'kaffeeweisser',
  ],
  suesswaren: [
    'schokolade', 'schoko', 'riegel', 'bonbon', 'bonbons', 'gummibaerchen', 'gummibaeren', 'fruchtgummi',
    'haribo', 'kekse', 'keks', 'chips', 'cracker', 'salzstangen', 'flips', 'popcorn', 'nuesse',
    'erdnuesse', 'pralinen', 'lakritz', 'waffeln', 'kaugummi', 'snack', 'studentenfutter',
    'milchschokolade', 'kartoffelchips', 'tortilla chips', 'nachos', 'muffins', 'loeffelbiskuit',
    'cashew', 'pistazien', 'mandeln', 'walnuesse', 'haselnuesse',
  ],
  getraenke: [
    'wasser', 'mineralwasser', 'sprudel', 'saft', 'orangensaft', 'apfelsaft', 'schorle', 'apfelschorle',
    'limo', 'limonade', 'cola', 'fanta', 'sprite', 'eistee', 'energy', 'energydrink', 'red bull', 'drink',
    'haferdrink', 'sojadrink', 'mandeldrink', 'nektar', 'tonic', 'mate', 'spezi', 'malzbier', 'isotonisch',
  ],
  alkohol: [
    'bier', 'pils', 'weizen', 'weissbier', 'radler', 'wein', 'rotwein', 'weisswein', '=rose', 'sekt',
    'prosecco', 'champagner', 'vodka', 'wodka', 'whisky', 'whiskey', '=rum', '=gin', 'likoer', 'schnaps',
    'aperol', '=korn', 'cider', 'helles', 'lager', 'tequila', 'cognac', 'brandy', 'gluehwein', 'hefeweizen',
  ],
  drogerie: [
    'shampoo', 'duschgel', 'duschbad', 'seife', 'fluessigseife', 'zahnpasta', 'zahncreme', 'zahnbuerste',
    '=deo', 'deodorant', 'handcreme', 'gesichtscreme', 'sonnencreme', 'bodylotion', 'lotion', 'rasierer',
    'rasierschaum', 'toilettenpapier', 'klopapier', 'taschentuecher', 'watte', 'wattestaebchen',
    'wattepads', 'tampons', 'binden', 'slipeinlagen', 'pflaster', 'kosmetik', 'haargel', 'spuelung',
    'zahnseide', 'mundspuelung', 'make up', 'nagellack', 'haarspray', 'kontaktlinsen', 'vitamine',
    'nahrungsergaenzung', 'kondome', 'abschminktuecher',
  ],
  haushalt: [
    'spuelmittel', 'waschmittel', 'weichspueler', 'reiniger', 'allzweckreiniger', 'putzmittel', 'schwamm',
    'schwaemme', 'spuelschwamm', 'muellbeutel', 'muelltueten', 'alufolie', 'frischhaltefolie', 'backpapier',
    'kuechenrolle', 'kuechenpapier', 'batterien', 'gluehbirne', 'leuchtmittel', 'kerzen', 'servietten',
    'spuelmaschinentabs', 'tabs', 'entkalker', 'wc reiniger', 'lappen', 'gefrierbeutel', 'streichhoelzer',
    'feuerzeug', 'glasreiniger', 'colorwaschmittel', 'vollwaschmittel', 'klarspueler', 'regeneriersalz',
    'grillkohle', 'zahnstocher', 'brotdose', 'tuete', 'tueten',
  ],
  baby: [
    'windeln', 'babynahrung', 'babybrei', 'brei', 'glaeschen', 'feuchttuecher', 'schnuller', 'pre milch',
    'folgemilch', 'babyoel', 'babyshampoo', 'hipp', 'bebivita', 'quetschie', 'babykeks',
  ],
  tier: [
    'hundefutter', 'katzenfutter', 'futter', 'katzenstreu', 'leckerli', 'kauknochen', 'nassfutter',
    'trockenfutter', 'vogelfutter', 'hund', 'katze', 'tierfutter', 'kaustange', 'whiskas', 'felix',
  ],
  nonfood: [
    'blumen', 'pflanze', 'pflanzen', 'blumenstrauss', 'socken', 'kleidung', 'spielzeug', 'zeitung',
    'zeitschrift', 'geschenk', 'werkzeug', 'aktion', 'karte', 'geschenkkarte', 'gutschein',
  ],
  sonstiges: [],
};

interface Keyword {
  text: string;
  wholeWord: boolean;
  category: CategoryId;
}

const KEYWORD_LIST: Keyword[] = Object.entries(KEYWORDS).flatMap(([category, words]) =>
  words.map((w) => ({
    text: w.replace(/^=/, ''),
    wholeWord: w.startsWith('='),
    category: category as CategoryId,
  })),
);

/**
 * Ermittelt die wahrscheinlichste Kategorie anhand von Stichwörtern.
 * Deutsche Komposita haben das Grundwort am Ende ("Erdbeerjoghurt" ist ein Joghurt),
 * daher bekommen Treffer am Wortende einen Bonus.
 */
export function classifyByKeywords(name: string): CategoryId | null {
  const n = normalize(name);
  if (!n) return null;
  const words = n.split(' ');
  // Lagerort-Angaben ("TK Erbsen", "Tiefkühl-Spinat") bestimmen den Platz im Markt.
  if (words.some((w) => w === 'tk' || w.startsWith('tiefkuehl') || w.startsWith('tiefgekuehlt'))) {
    return 'tiefkuehl';
  }
  let best: { score: number; category: CategoryId } | null = null;

  for (const kw of KEYWORD_LIST) {
    let score = -1;
    if (kw.text.includes(' ')) {
      if (` ${n} `.includes(` ${kw.text} `)) score = kw.text.length + 14;
    } else {
      words.forEach((word, index) => {
        let s = -1;
        if (word === kw.text) {
          s = kw.text.length + 12;
        } else if (!kw.wholeWord && word.includes(kw.text)) {
          s = kw.text.length;
          if (word.endsWith(kw.text)) s += 10;
          if (word.startsWith(kw.text)) s += 2;
        }
        if (s >= 0) {
          // Spätere Wörter tragen im Deutschen meist das Hauptwort ("Bio Vollmilch").
          s += index * 0.5;
          score = Math.max(score, s);
        }
      });
    }
    if (score >= 0 && (!best || score > best.score)) {
      best = { score, category: kw.category };
    }
  }
  return best ? best.category : null;
}

/** Kategorie aus Open-Food-Facts-Tags (z. B. "en:dairies") ableiten. */
const OFF_TAG_MAP: Array<[RegExp, CategoryId]> = [
  [/^en:(frozen-foods|frozen-desserts|ice-creams|frozen-)/, 'tiefkuehl'],
  [/^en:(alcoholic-beverages|beers|wines|spirits|ciders|sparkling-wines)/, 'alkohol'],
  [/^en:(baby-foods|baby-milks|infant)/, 'baby'],
  [/^en:(pet-food|dog-food|cat-food)/, 'tier'],
  [/^en:(cheeses|cheese)/, 'kaese'],
  [/^en:(yogurts|milks|dairies|dairy-desserts|butters|creams|eggs|fermented-milk|margarines)/, 'molkerei'],
  [/^en:(plant-based-milk|plant-milks|non-dairy)/, 'getraenke'],
  [/^en:(fishes|seafood|fish-and-seafood|smoked-fishes|fishery-products)/, 'fisch'],
  [/^en:(meats|sausages|hams|poultries|prepared-meats|meat)/, 'fleisch_wurst'],
  [/^en:(breads|viennoiseries|cakes|pastries|crackers-appetizers)/, 'backwaren'],
  [/^en:(salads|prepared-salads|fresh-pasta|sandwiches|meals-with)/, 'convenience'],
  [/^en:(canned-|canned|soups|tomato-pastes|tomato-sauces|pickles)/, 'konserven'],
  [/^en:(meals|ready-meals)/, 'konserven'],
  [/^en:(pastas|rices|legumes|pulses|cereal-grains|semolinas|couscous)/, 'grundnahrung'],
  [/^en:(flours|sugars|baking-|leavening|yeasts|starches)/, 'backzutaten'],
  [/^en:(breakfast-cereals|mueslis|spreads|honeys|jams|hazelnut-spreads|sweet-spreads|breakfasts)/, 'fruehstueck'],
  [/^en:(coffees|teas|hot-beverages|cocoa)/, 'kaffee_tee'],
  [/^en:(sauces|condiments|spices|vegetable-oils|oils|vinegars|salts|mustards|mayonnaises|ketchup|broths)/, 'gewuerze'],
  [/^en:(chocolates|confectioneries|candies|biscuits|sweet-snacks|salty-snacks|snacks|chips|crisps|nuts)/, 'suesswaren'],
  [/^en:(waters|juices|sodas|beverages|fruit-juices|iced-teas|energy-drinks|soft-drinks)/, 'getraenke'],
  [/^en:(fruits|vegetables|fresh-fruits|fresh-vegetables|fruits-and-vegetables|plant-based-foods)$/, 'obst_gemuese'],
];

export function classifyByOffTags(tags: string[] | undefined): CategoryId | null {
  if (!tags || tags.length === 0) return null;
  // Tiefkühl gilt als Ort im Markt und gewinnt immer.
  if (tags.some((t) => OFF_TAG_MAP[0][0].test(t))) return 'tiefkuehl';
  // OFF sortiert von allgemein nach spezifisch, also von hinten suchen.
  for (let i = tags.length - 1; i >= 0; i--) {
    for (const [re, category] of OFF_TAG_MAP) {
      if (re.test(tags[i])) return category;
    }
  }
  return null;
}
