// Nationality -> cuisines suggested during onboarding, plus a compact built-in dish database
// (typical single serving; values are estimates) used for search before falling back to Open Food Facts.

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

// [name, cuisine, kcal, protein, carbs, fat, serving]
const D = [
  ['Roti / chapati', 'Indian', 104, 3, 18, 3, '1 piece'], ['Plain dosa', 'Indian', 133, 3, 22, 4, '1 dosa'],
  ['Idli', 'Indian', 58, 2, 12, 0.4, '1 piece'], ['Dal tadka', 'Indian', 180, 9, 22, 6, '1 bowl'],
  ['Chicken biryani', 'Indian', 490, 24, 62, 15, '1 plate'], ['Paneer butter masala', 'Indian', 350, 14, 12, 28, '1 bowl'],
  ['Chole (chickpea curry)', 'Indian', 270, 12, 38, 8, '1 bowl'], ['Steamed basmati rice', 'Indian', 205, 4, 45, 0.4, '1 cup'],
  ['Samosa', 'Indian', 262, 4, 24, 17, '1 piece'], ['Poha', 'Indian', 250, 5, 45, 6, '1 plate'],
  ['Tandoori chicken', 'Indian', 260, 32, 4, 12, '2 pieces'], ['Masala chai', 'Indian', 90, 2, 14, 3, '1 cup'],
  ['Fried rice', 'Chinese', 340, 9, 52, 10, '1 plate'], ['Chow mein', 'Chinese', 390, 12, 55, 14, '1 plate'],
  ['Kung pao chicken', 'Chinese', 430, 30, 18, 26, '1 plate'], ['Steamed dumplings', 'Chinese', 220, 10, 28, 7, '6 pieces'],
  ['Hot and sour soup', 'Chinese', 90, 6, 10, 3, '1 bowl'], ['Mapo tofu', 'Chinese', 320, 18, 10, 23, '1 plate'],
  ['Sushi roll (salmon)', 'Japanese', 300, 12, 46, 7, '6 pieces'], ['Chicken teriyaki bowl', 'Japanese', 560, 34, 75, 13, '1 bowl'],
  ['Miso soup', 'Japanese', 40, 3, 5, 1, '1 bowl'], ['Tonkotsu ramen', 'Japanese', 650, 28, 70, 28, '1 bowl'],
  ['Onigiri', 'Japanese', 180, 4, 38, 1, '1 piece'], ['Chicken katsu', 'Japanese', 480, 32, 28, 26, '1 plate'],
  ['Bibimbap', 'Korean', 560, 22, 80, 16, '1 bowl'], ['Kimchi', 'Korean', 23, 1, 4, 0.2, '1 cup'],
  ['Bulgogi beef', 'Korean', 380, 30, 14, 22, '1 plate'], ['Tteokbokki', 'Korean', 380, 8, 78, 4, '1 bowl'],
  ['Pad thai', 'Thai', 540, 21, 70, 20, '1 plate'], ['Green curry (chicken)', 'Thai', 420, 24, 14, 30, '1 bowl'],
  ['Tom yum soup', 'Thai', 110, 12, 8, 3, '1 bowl'], ['Mango sticky rice', 'Thai', 410, 5, 80, 9, '1 serving'],
  ['Pho (beef)', 'Vietnamese', 420, 28, 60, 8, '1 bowl'], ['Banh mi', 'Vietnamese', 480, 22, 58, 18, '1 sandwich'],
  ['Fresh spring rolls', 'Vietnamese', 140, 6, 22, 3, '2 rolls'], ['Bun cha', 'Vietnamese', 560, 30, 70, 17, '1 bowl'],
  ['Margherita pizza', 'Italian', 270, 11, 33, 10, '1 slice'], ['Spaghetti bolognese', 'Italian', 620, 28, 78, 21, '1 plate'],
  ['Lasagna', 'Italian', 410, 22, 33, 21, '1 piece'], ['Risotto (mushroom)', 'Italian', 380, 9, 62, 10, '1 plate'],
  ['Caprese salad', 'Italian', 250, 14, 6, 19, '1 plate'], ['Tiramisu', 'Italian', 400, 7, 40, 24, '1 piece'],
  ['Greek salad', 'Mediterranean', 210, 6, 11, 16, '1 bowl'], ['Hummus with pita', 'Mediterranean', 290, 10, 38, 12, '1 serving'],
  ['Grilled fish with veg', 'Mediterranean', 360, 38, 14, 16, '1 plate'], ['Falafel wrap', 'Mediterranean', 520, 17, 62, 24, '1 wrap'],
  ['Shawarma (chicken)', 'Middle Eastern', 540, 35, 45, 24, '1 wrap'], ['Tabbouleh', 'Middle Eastern', 140, 3, 16, 8, '1 cup'],
  ['Lamb kebab', 'Middle Eastern', 380, 28, 4, 28, '2 skewers'], ['Mujaddara', 'Middle Eastern', 370, 13, 60, 8, '1 plate'],
  ['Chicken burrito', 'Mexican', 680, 36, 78, 22, '1 burrito'], ['Beef tacos', 'Mexican', 210, 10, 18, 11, '1 taco'],
  ['Guacamole with chips', 'Mexican', 330, 4, 32, 21, '1 serving'], ['Chicken quesadilla', 'Mexican', 520, 28, 38, 28, '1 piece'],
  ['Cheeseburger', 'American', 540, 28, 40, 28, '1 burger'], ['French fries', 'American', 365, 4, 48, 17, 'medium'],
  ['Caesar salad (chicken)', 'American', 390, 30, 14, 24, '1 bowl'], ['Pancakes with syrup', 'American', 520, 9, 90, 14, '3 pancakes'],
  ['Mac and cheese', 'American', 440, 17, 48, 20, '1 cup'], ['Peanut butter sandwich', 'American', 380, 14, 38, 19, '1 sandwich'],
  ['Full English breakfast', 'British', 780, 38, 42, 50, '1 plate'], ['Fish and chips', 'British', 840, 35, 80, 42, '1 plate'],
  ['Shepherd\'s pie', 'British', 450, 24, 38, 22, '1 serving'], ['Chicken tikka masala', 'British', 440, 30, 16, 28, '1 bowl'],
  ['Croissant', 'French', 230, 5, 26, 12, '1 piece'], ['Ratatouille', 'French', 170, 3, 20, 9, '1 bowl'],
  ['Coq au vin', 'French', 480, 38, 10, 28, '1 plate'], ['Crepe with jam', 'French', 190, 4, 32, 5, '1 crepe'],
  ['Jollof rice', 'African', 380, 8, 62, 11, '1 plate'], ['Injera with wot', 'African', 420, 16, 64, 11, '1 plate'],
  ['Egusi soup with fufu', 'African', 620, 22, 70, 28, '1 plate'], ['Bunny chow', 'African', 640, 24, 82, 22, '1 serving'],
  ['Feijoada', 'Latin American', 560, 32, 52, 24, '1 plate'], ['Arepa with cheese', 'Latin American', 320, 11, 36, 15, '1 arepa'],
  ['Empanada', 'Latin American', 290, 9, 28, 16, '1 piece'], ['Ceviche', 'Latin American', 190, 24, 12, 4, '1 bowl'],
  ['Tofu stir-fry', 'Vegetarian / Vegan', 310, 20, 18, 18, '1 plate'], ['Lentil soup', 'Vegetarian / Vegan', 230, 16, 38, 1, '1 bowl'],
  ['Buddha bowl', 'Vegetarian / Vegan', 480, 18, 62, 18, '1 bowl'], ['Veggie burger', 'Vegetarian / Vegan', 380, 18, 42, 15, '1 burger']
];
// Cuisine-agnostic staples.
const STAPLES = [
  ['Banana', 105, 1.3, 27, 0.4, '1 medium'], ['Apple', 95, 0.5, 25, 0.3, '1 medium'], ['Boiled egg', 78, 6, 0.6, 5, '1 egg'],
  ['Scrambled eggs', 180, 12, 2, 14, '2 eggs'], ['Oatmeal with milk', 220, 9, 34, 6, '1 bowl'], ['Greek yogurt', 130, 17, 8, 3, '1 cup'],
  ['Whole wheat toast', 80, 4, 14, 1, '1 slice'], ['Chicken breast, grilled', 165, 31, 0, 3.6, '100 g'], ['Salmon fillet', 208, 22, 0, 13, '100 g'],
  ['Almonds', 164, 6, 6, 14, '28 g'], ['Whey protein shake', 130, 25, 4, 2, '1 scoop'], ['Black coffee', 2, 0.3, 0, 0, '1 cup'],
  ['Latte', 190, 10, 18, 7, '1 medium'], ['Orange juice', 112, 2, 26, 0.5, '1 cup'], ['Milk (whole)', 150, 8, 12, 8, '1 cup'],
  ['Dark chocolate', 170, 2, 13, 12, '28 g'], ['Ice cream', 270, 5, 32, 14, '1 cup'], ['Cola', 140, 0, 39, 0, '1 can'],
  ['White rice, cooked', 205, 4, 45, 0.4, '1 cup'], ['Mixed green salad', 60, 2, 8, 2, '1 bowl'], ['Avocado', 240, 3, 13, 22, '1 whole'],
  ['Peanut butter', 190, 7, 7, 16, '2 tbsp'], ['Pasta, cooked', 220, 8, 43, 1.3, '1 cup'], ['Sweet potato', 112, 2, 26, 0.1, '1 medium']
];

export const FOODS = [
  ...D.map(([name, cuisine, kcal, protein, carbs, fat, serving]) => ({ name, cuisine, kcal, protein, carbs, fat, serving })),
  ...STAPLES.map(([name, kcal, protein, carbs, fat, serving]) => ({ name, cuisine: null, kcal, protein, carbs, fat, serving }))
];

export function searchFoods(q, cuisines = []) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const usual = new Set(cuisines.filter((c) => c.freq === 'usually').map((c) => c.cuisine));
  const some = new Set(cuisines.filter((c) => c.freq === 'sometimes').map((c) => c.cuisine));
  const scored = [];
  for (const f of FOODS) {
    const hay = `${f.name} ${f.cuisine || ''}`.toLowerCase();
    if (terms.length && !terms.every((t) => hay.includes(t))) continue;
    let s = hay.startsWith(terms[0] || '') ? 2 : 0;
    if (usual.has(f.cuisine)) s += 3; else if (some.has(f.cuisine)) s += 1.5; else if (!f.cuisine) s += 1;
    scored.push([s, f]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map(([, f]) => ({ ...f, source: 'builtin' }));
}
