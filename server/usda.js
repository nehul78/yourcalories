// USDA FoodData Central (public domain) lookup for generic foods and ingredients.
// Needs a free API key from https://fdc.nal.usda.gov/api-key-signup (env USDA_API_KEY); without one it is skipped.
const cache = new Map();
const NUTRIENT = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 };

export const usdaEnabled = () => !!process.env.USDA_API_KEY;

const title = (s) => s.toLowerCase().replace(/(^|[\s,(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export async function searchUsda(q, fetcher = fetch) {
  if (!usdaEnabled() || q.length < 3) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=6&dataType=Foundation,SR%20Legacy&api_key=${encodeURIComponent(process.env.USDA_API_KEY)}`;
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const out = [];
    for (const f of (await r.json()).foods || []) {
      const n = (id) => f.foodNutrients?.find((x) => x.nutrientId === id)?.value;
      const kcal = n(NUTRIENT.kcal);
      if (!Number.isFinite(kcal)) continue;
      out.push({ name: title(f.description), kcal: Math.round(kcal), protein: Math.round((n(NUTRIENT.protein) || 0) * 10) / 10, carbs: Math.round((n(NUTRIENT.carbs) || 0) * 10) / 10, fat: Math.round((n(NUTRIENT.fat) || 0) * 10) / 10, serving: '100 g', source: 'usda' });
    }
    cache.set(key, { t: Date.now(), v: out });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return out;
  } catch { return []; }
}
