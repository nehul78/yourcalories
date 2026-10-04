// "Describe your meal": Claude turns a plain-language description into itemised, editable nutrition estimates.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
export const describeEnabled = () => !!process.env.ANTHROPIC_API_KEY || !!testClient;

const Item = z.object({
  name: z.string(),
  portion: z.string(),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  confidence: z.enum(['high', 'medium', 'low'])
});
const Result = z.object({ items: z.array(Item), note: z.string() });

const SYSTEM = `You estimate the nutrition of meals that people describe in everyday words, for a calorie-tracking app used by friends and their coaches.

Split the description into separate food items. For each item give a realistic portion (state it plainly, e.g. "2 rotis", "1 katori (150 g)", "1 medium bowl"), calories in kcal, and grams of protein, carbohydrate and fat.
- Use typical home or restaurant portions for the cuisines the person eats when quantities are not given, and say what you assumed in the portion text.
- Prefer a sensible central estimate over a range. Calories should roughly match 4 x protein + 4 x carbs + 9 x fat.
- Set confidence to "low" for mixed dishes with unknown ingredients or oil/ghee amounts, "high" only for simple, well-defined foods.
- Return at most 12 items. If the text is not about food or drink, return no items and explain briefly in "note".
- "note" is one short sentence (empty string if there is nothing worth saying) about the biggest uncertainty, such as hidden oil or an assumed portion.`;

let testClient = null;
export const setDescribeClient = (c) => { testClient = c; };

const day = () => new Date().toISOString().slice(0, 10);
const uses = new Map(); // `${userId}:${day}` -> count; resets on restart, a guard against runaway cost not billing
export function checkQuota(userId) {
  const limit = Number(process.env.DESCRIBE_DAILY_LIMIT || 25), k = `${userId}:${day()}`;
  const n = uses.get(k) || 0;
  if (n >= limit) return false;
  for (const key of uses.keys()) if (!key.endsWith(day())) uses.delete(key);
  uses.set(k, n + 1);
  return true;
}

export async function describeMeal(text, { cuisines = [], nationality } = {}) {
  const client = testClient || new Anthropic();
  const eats = cuisines.map((c) => `${c.cuisine} (${c.freq})`).join(', ');
  const response = await client.messages.parse({
    model: MODEL(),
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Result) },
    messages: [{ role: 'user', content: `${nationality ? `Nationality: ${nationality}\n` : ''}${eats ? `Cuisines they eat: ${eats}\n` : ''}Meal: ${text}` }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('That description could not be estimated. Try rewording it.'), { status: 422 });
  const out = response.parsed_output;
  if (!out) throw Object.assign(new Error('The estimate came back unreadable. Please try again.'), { status: 502 });
  const r1 = (n) => Math.round(Math.max(0, n) * 10) / 10;
  return {
    note: out.note || '',
    items: out.items.slice(0, 12).filter((i) => i.name.trim()).map((i) => ({
      name: i.name.trim().slice(0, 120), serving: i.portion.slice(0, 80), kcal: Math.min(5000, Math.round(Math.max(0, i.kcal))),
      protein: r1(i.protein_g), carbs: r1(i.carbs_g), fat: r1(i.fat_g), confidence: i.confidence, source: 'ai'
    }))
  };
}
