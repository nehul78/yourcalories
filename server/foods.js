// Nationality -> cuisines suggested during onboarding, plus the built-in dish database used for search
// before the packaged-food and USDA lookups. Dish tables live in ./dishdata (one line per dish).
import indian from './dishdata/indian.js';
import { chinese, japanese, korean, thai, vietnamese } from './dishdata/east-asian.js';
import { italian, mediterranean, french, british, american } from './dishdata/western.js';
import { middleEastern, mexican, latinAmerican, african, vegetarian } from './dishdata/other.js';
import staples from './dishdata/staples.js';

export const CUISINES = [
  'Indian', 'Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Italian', 'Mediterranean',
  'Middle Eastern', 'Mexican', 'American', 'British', 'French', 'African', 'Latin American', 'Vegetarian / Vegan'
];

// Home cuisine(s) first, then neighbours / popular picks.
const REGIONS = {
  India: ['Indian', 'Chinese', 'Italian', 'American', 'Middle Eastern'],
  Pakistan: ['Indian', 'Middle Eastern', 'Chinese', 'American'],
  Bangladesh: ['Indian', 'Chinese', 'Middle Eastern', 'American'],
  'Sri Lanka': ['Indian', 'Chinese', 'Thai', 'American'],
  China: ['Chinese', 'Japanese', 'Korean', 'Thai', 'American'],
  Japan: ['Japanese', 'Chinese', 'Korean', 'Italian', 'American'],
  'South Korea': ['Korean', 'Japanese', 'Chinese', 'American', 'Italian'],
  Thailand: ['Thai', 'Chinese', 'Vietnamese', 'Japanese', 'American'],
  Vietnam: ['Vietnamese', 'Thai', 'Chinese', 'Korean', 'American'],
  Philippines: ['Chinese', 'American', 'Japanese', 'Korean', 'Thai'],
  Indonesia: ['Thai', 'Chinese', 'Middle Eastern', 'Indian', 'American'],
  'United States': ['American', 'Mexican', 'Italian', 'Chinese', 'Mediterranean', 'Indian'],
  Canada: ['American', 'French', 'Italian', 'Chinese', 'Indian', 'Mexican'],
  Mexico: ['Mexican', 'Latin American', 'American', 'Italian'],
  Brazil: ['Latin American', 'Italian', 'American', 'Japanese', 'Middle Eastern'],
  Argentina: ['Latin American', 'Italian', 'American', 'Mediterranean'],
  'United Kingdom': ['British', 'Indian', 'Italian', 'Chinese', 'French', 'American'],
  Ireland: ['British', 'Italian', 'Indian', 'Chinese', 'American'],
  France: ['French', 'Italian', 'Mediterranean', 'Middle Eastern', 'Chinese'],
  Italy: ['Italian', 'Mediterranean', 'French', 'American', 'Chinese'],
  Spain: ['Mediterranean', 'Italian', 'Latin American', 'French', 'American'],
  Germany: ['Italian', 'Middle Eastern', 'American', 'Chinese', 'French'],
  Greece: ['Mediterranean', 'Italian', 'Middle Eastern', 'American'],
  Turkey: ['Middle Eastern', 'Mediterranean', 'Italian', 'American'],
  'Saudi Arabia': ['Middle Eastern', 'Indian', 'American', 'Italian'],
  'United Arab Emirates': ['Middle Eastern', 'Indian', 'American', 'Italian', 'Chinese'],
  Egypt: ['Middle Eastern', 'Mediterranean', 'African', 'American'],
  Israel: ['Middle Eastern', 'Mediterranean', 'Italian', 'American'],
  Nigeria: ['African', 'British', 'American', 'Indian', 'Chinese'],
  Ghana: ['African', 'British', 'American', 'Indian'],
  Kenya: ['African', 'Indian', 'British', 'American'],
  'South Africa': ['African', 'British', 'Indian', 'American', 'Italian'],
  Ethiopia: ['African', 'Middle Eastern', 'Italian', 'American'],
  Australia: ['American', 'British', 'Italian', 'Chinese', 'Thai', 'Indian'],
  'New Zealand': ['British', 'American', 'Italian', 'Chinese', 'Thai'],
  Singapore: ['Chinese', 'Indian', 'Thai', 'Japanese', 'American'],
  Malaysia: ['Chinese', 'Indian', 'Thai', 'Middle Eastern', 'American'],
  Nepal: ['Indian', 'Chinese', 'American'],
  Russia: ['Mediterranean', 'Italian', 'American', 'Chinese', 'Middle Eastern'],
  Other: CUISINES.slice(0, 12)
};
export const NATIONALITIES = Object.keys(REGIONS).filter((n) => n !== 'Other').sort().concat('Other');
export const suggestCuisines = (nat) => {
  const first = REGIONS[nat] || REGIONS.Other;
  return [...first, ...CUISINES.filter((c) => !first.includes(c))];
};

/* ---------- dish tables ---------- */
// name | alternate names (;) | region or category | kcal protein carbs fat | serving
function parse(text, cuisine) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, alts, region, macros, serving] = line.split('|').map((s) => s.trim());
    const [kcal, protein, carbs, fat] = macros.split(/\s+/).map(Number);
    // "Roti / chapati" is two names for one dish; make each half searchable on its own
    const split = name.includes(' / ') ? name.split(' / ').map((a) => a.trim().toLowerCase()) : [];
    return { name, cuisine, region: region || null, kcal, protein, carbs, fat, serving,
      alts: [...(alts ? alts.split(';').map((a) => a.trim().toLowerCase()) : []), ...split] };
  });
}

export const FOODS = [
  ...parse(indian, 'Indian'), ...parse(chinese, 'Chinese'), ...parse(japanese, 'Japanese'), ...parse(korean, 'Korean'),
  ...parse(thai, 'Thai'), ...parse(vietnamese, 'Vietnamese'), ...parse(italian, 'Italian'), ...parse(mediterranean, 'Mediterranean'),
  ...parse(middleEastern, 'Middle Eastern'), ...parse(mexican, 'Mexican'), ...parse(american, 'American'), ...parse(british, 'British'),
  ...parse(french, 'French'), ...parse(african, 'African'), ...parse(latinAmerican, 'Latin American'), ...parse(vegetarian, 'Vegetarian / Vegan'),
  ...parse(staples, null)
];

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => (w.length > 3 ? w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')) : w);
FOODS.forEach((f, i) => {
  f._i = i; // file order = rough popularity, used as a tie-break
  f._name = norm(f.name);
  f._alts = f.alts.map(norm);
  f._hay = [f._name, ...f._alts, norm(f.region || ''), norm(f.cuisine || '')].join(' ');
  f._words = new Set(f._hay.split(' ').map(stem));
});

/**
 * Ranks built-in foods for a query. Matches names, alternate names ("chapati" finds "Roti / chapati"),
 * region ("south indian") and cuisine; prefers the cuisines the member said they eat.
 */
export function searchFoods(q, cuisines = [], limit = 30) {
  const terms = norm(q).split(' ').filter(Boolean);
  const usual = new Set(cuisines.filter((c) => c.freq === 'usually').map((c) => c.cuisine));
  const some = new Set(cuisines.filter((c) => c.freq === 'sometimes').map((c) => c.cuisine));
  const joined = terms.join(' ');
  const scored = [];
  for (const f of FOODS) {
    if (terms.length && !terms.every((t) => f._hay.includes(t) || f._words.has(stem(t)))) continue;
    let s = 0;
    if (joined) {
      if (f._name === joined || f._alts.includes(joined)) s += 10;
      else if (f._name.startsWith(joined) || f._alts.some((a) => a.startsWith(joined))) s += 6;
      else if (f._name.includes(joined) || f._alts.some((a) => a.includes(joined))) s += 4;
      else if (terms.every((t) => f._name.includes(t) || f._alts.some((a) => a.includes(t)))) s += 2;
    }
    if (usual.has(f.cuisine)) s += 3; else if (some.has(f.cuisine)) s += 1.5; else if (!f.cuisine) s += 1;
    scored.push([s, f]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1]._i - b[1]._i).slice(0, limit)
    .map(([, f]) => ({ name: f.name, cuisine: f.cuisine, region: f.region, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, serving: f.serving, source: 'builtin' }));
}

/** A starter list for an empty search box: popular dishes from the member's own cuisines. */
export function suggestedFoods(cuisines = [], limit = 12) {
  const usual = cuisines.filter((c) => c.freq === 'usually').map((c) => c.cuisine);
  const pool = FOODS.filter((f) => usual.includes(f.cuisine) && !['Sweet', 'Drink'].includes(f.region));
  const out = [];
  for (let i = 0; out.length < limit && i < pool.length; i += Math.max(1, Math.floor(pool.length / limit))) out.push(pool[i]);
  return out.map((f) => ({ name: f.name, cuisine: f.cuisine, region: f.region, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, serving: f.serving, source: 'builtin' }));
}
