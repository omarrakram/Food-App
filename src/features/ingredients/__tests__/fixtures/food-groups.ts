import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';

/**
 * A coarse food group, used only by the vocabulary benchmark.
 *
 * NOT the catalogue's `category`, deliberately. `category` is a shopping-aisle
 * taxonomy — `protein` holds beef, tilapia, lentils and tofu; `pantry` holds
 * almonds, flour, tea and chickpeas. That is right for browsing and useless
 * for the question this benchmark asks, which is "if the app guessed wrong,
 * did it guess something a cook could mistake for the real thing?".
 *
 * Offering chili flakes for chili powder is a miss. Offering pigeon for
 * cantaloupe is a different kind of event, and the two must not be counted
 * together.
 */
export type FoodGroup =
  | 'vegetable'
  | 'fruit'
  | 'herb'
  | 'spice'
  | 'red-meat'
  | 'offal'
  | 'poultry'
  | 'fish'
  | 'seafood'
  | 'egg'
  | 'dairy'
  | 'cheese'
  | 'bread'
  | 'grain'
  | 'pasta'
  | 'legume'
  | 'nut-seed'
  | 'oil'
  | 'condiment'
  | 'sweetener'
  | 'beverage'
  | 'prepared'
  | 'packaged'
  | 'baking'
  | 'water';

/**
 * Slugs whose catalogue category says the wrong thing for this purpose.
 *
 * Every entry here is a place where the aisle taxonomy and the kitchen
 * taxonomy disagree. Kept explicit rather than inferred, because a wrong
 * grouping would quietly weaken the safety invariant this file exists to
 * support.
 */
const OVERRIDES: Record<string, FoodGroup> = {
  // `protein` is really six groups wearing one label.
  'bacon-beef': 'red-meat', 'beef-cubes': 'red-meat', 'beef-steak': 'red-meat',
  'ground-beef': 'red-meat', lamb: 'red-meat', 'lamb-chops': 'red-meat',
  veal: 'red-meat', kofta: 'red-meat', pastrami: 'red-meat', sausage: 'red-meat',
  'hot-dog': 'red-meat', 'luncheon-meat': 'red-meat', rabbit: 'red-meat',
  'chicken-liver': 'offal', liver: 'offal',
  'chicken-breast': 'poultry', 'chicken-thigh': 'poultry', 'chicken-wings': 'poultry',
  duck: 'poultry', pigeon: 'poultry', turkey: 'poultry',
  anchovy: 'fish', herring: 'fish', mackerel: 'fish', mullet: 'fish',
  salmon: 'fish', 'salted-fish': 'fish', sardines: 'fish', 'sea-bass': 'fish',
  'sea-bream': 'fish', tilapia: 'fish', 'tuna-can': 'fish',
  calamari: 'seafood', crab: 'seafood', mussels: 'seafood', shrimp: 'seafood',
  eggs: 'egg',
  edamame: 'legume', 'green-lentils': 'legume', 'kidney-beans': 'legume',
  soybeans: 'legume', 'split-peas': 'legume', tofu: 'legume',
  'falafel-mix': 'prepared',

  // `pantry` is the other catch-all.
  almonds: 'nut-seed', cashews: 'nut-seed', chia: 'nut-seed', flaxseed: 'nut-seed',
  hazelnuts: 'nut-seed', peanuts: 'nut-seed', 'pine-nuts': 'nut-seed',
  pistachios: 'nut-seed', 'pumpkin-seeds': 'nut-seed', 'sunflower-seeds': 'nut-seed',
  walnuts: 'nut-seed', 'coconut-flakes': 'nut-seed', 'peanut-butter': 'nut-seed',
  'black-eyed-peas': 'legume', chickpeas: 'legume', 'fava-beans': 'legume',
  lentils: 'legume', 'white-beans': 'legume',
  'baking-chocolate': 'baking', 'baking-powder': 'baking', flour: 'baking',
  gelatin: 'baking', yeast: 'baking', cocoa: 'baking', 'icing-sugar': 'baking',
  'brown-sugar': 'sweetener', 'corn-syrup': 'sweetener', honey: 'sweetener',
  sugar: 'sweetener', chocolate: 'sweetener',
  'corn-oil': 'oil', 'sesame-oil': 'oil',
  'lemon-juice': 'condiment', 'orange-blossom': 'condiment', 'rose-water': 'condiment',
  'vinegar-apple': 'condiment', 'stock-cube': 'condiment',
  coffee: 'beverage', tea: 'beverage',

  // `sauces` holds the oils.
  'olive-oil': 'oil', 'sunflower-oil': 'oil',
  'bbq-sauce': 'condiment', 'hot-sauce': 'condiment', ketchup: 'condiment',
  mayonnaise: 'condiment', mustard: 'condiment', 'soy-sauce': 'condiment',
  'tomato-paste': 'condiment', 'tomato-sauce': 'condiment', vinegar: 'condiment',
  worcestershire: 'condiment', tahini: 'condiment',
  'date-syrup': 'sweetener', molasses: 'sweetener', 'pomegranate-molasses': 'sweetener',
  'baba-ganoush': 'prepared', 'hummus-dip': 'prepared', 'tahini-salad': 'prepared',
  'coconut-milk': 'packaged',

  // Herbs are filed as vegetables; a few condiments are too.
  basil: 'herb', coriander: 'herb', dill: 'herb', mint: 'herb', parsley: 'herb',
  rocket: 'herb', watercress: 'herb', 'spring-garlic': 'herb',
  ginger: 'spice',
  capers: 'condiment', olives: 'condiment', pickles: 'condiment',
  'sun-dried-tomato': 'condiment',

  // Odd ones out inside their own categories.
  'sesame-seeds': 'nut-seed', hibiscus: 'beverage', vanilla: 'baking',
  cheddar: 'cheese', 'cream-cheese': 'cheese', halloumi: 'cheese',
  kashkaval: 'cheese', mozzarella: 'cheese', parmesan: 'cheese',
  'roumy-cheese': 'cheese', 'white-cheese': 'cheese', labneh: 'cheese',
  'egg-white': 'egg', 'egg-yolk': 'egg',
  'lasagne-sheets': 'pasta', noodles: 'pasta', pasta: 'pasta',
  vermicelli: 'pasta', couscous: 'pasta',
  cornflour: 'baking',
  breadcrumbs: 'baking', phyllo: 'baking', 'puff-pastry': 'baking',
  'frozen-fries': 'vegetable', 'frozen-mixed-veg': 'vegetable',
  'green-peas': 'vegetable', 'ice-cream': 'dairy',
  coconut: 'nut-seed',
  water: 'water', ice: 'water',
};

/** Category fallback, for everything the overrides leave alone. */
const BY_CATEGORY: Record<string, FoodGroup> = {
  vegetables: 'vegetable',
  fruit: 'fruit',
  spices: 'spice',
  dairy: 'dairy',
  carbs: 'grain',
  bakery: 'bread',
  protein: 'red-meat',
  pantry: 'packaged',
  sauces: 'condiment',
  frozen: 'packaged',
  other: 'water',
};

const GROUP_BY_SLUG = new Map<string, FoodGroup>(
  INGREDIENT_CATALOGUE.map((ingredient) => [
    ingredient.slug,
    OVERRIDES[ingredient.slug] ?? BY_CATEGORY[ingredient.category] ?? 'packaged',
  ]),
);

export function foodGroupOf(slug: string): FoodGroup | null {
  return GROUP_BY_SLUG.get(slug) ?? null;
}

/** Every override must name a slug that exists, or the map is silently wrong. */
export function unknownOverrideSlugs(): string[] {
  const known = new Set(INGREDIENT_CATALOGUE.map((i) => i.slug));
  return Object.keys(OVERRIDES).filter((slug) => !known.has(slug));
}
