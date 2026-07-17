/**
 * Deterministic seed-oil / additive / chemical detection from a real
 * ingredients string. Labely uses this so flags come from the list.
 */

const SEED_OIL_PATTERNS = [
  { re: /\bsoybean\s+oils?\b/i, label: "soybean oil" },
  { re: /\bsoya\s+oils?\b/i, label: "soybean oil" },
  { re: /\bcanola\s+oils?\b/i, label: "canola oil" },
  { re: /\brapeseed\s+oils?\b/i, label: "canola oil" },
  { re: /\bcorn\s+oils?\b/i, label: "corn oil" },
  { re: /\bsunflower\s+oils?\b/i, label: "sunflower oil" },
  { re: /\bsafflower\s+oils?\b/i, label: "safflower oil" },
  { re: /\bcottonseed\s+oils?\b/i, label: "cottonseed oil" },
  { re: /\bgrapeseed\s+oils?\b/i, label: "grapeseed oil" },
  { re: /\brice\s+bran\s+oils?\b/i, label: "rice bran oil" },
  { re: /\bpalm\s+kernel\s+oils?\b/i, label: "palm kernel oil" },
  { re: /\bvegetable\s+oils?\b/i, label: "vegetable oil" },
  { re: /\bhydrogenated\s+(?:\w+\s+)?oils?\b/i, label: "hydrogenated oil" },
  { re: /\bpartially\s+hydrogenated\b/i, label: "partially hydrogenated oil" },
  { re: /\bseed\s+oils?\b/i, label: "seed oil" },
];

const ADDITIVE_PATTERNS = [
  // Antioxidants / preservatives
  { re: /\bTBHQ\b/i, label: "TBHQ" },
  { re: /\btert(?:iary)?[-\s]?butylhydroquinone\b/i, label: "TBHQ" },
  { re: /\bBHA\b/i, label: "BHA" },
  { re: /\bbutylated\s+hydroxyanisole\b/i, label: "BHA" },
  { re: /\bBHT\b/i, label: "BHT" },
  { re: /\bbutylated\s+hydroxytoluene\b/i, label: "BHT" },
  { re: /\bpropyl\s+gallate\b/i, label: "propyl gallate" },
  { re: /\bsodium\s+benzoate\b/i, label: "sodium benzoate" },
  { re: /\bpotassium\s+benzoate\b/i, label: "potassium benzoate" },
  { re: /\bsodium\s+nitrite\b/i, label: "sodium nitrite" },
  { re: /\bsodium\s+nitrate\b/i, label: "sodium nitrate" },
  { re: /\bpotassium\s+nitrate\b/i, label: "potassium nitrate" },
  { re: /\bsodium\s+sulfite\b/i, label: "sodium sulfite" },
  { re: /\bsodium\s+bisulfite\b/i, label: "sodium bisulfite" },
  { re: /\bsodium\s+metabisulfite\b/i, label: "sodium metabisulfite" },
  { re: /\bpotassium\s+metabisulfite\b/i, label: "potassium metabisulfite" },
  { re: /\bsulfites?\b/i, label: "sulfites" },
  { re: /\bsulfur\s+dioxide\b/i, label: "sulfur dioxide" },
  { re: /\bcalcium\s+propionate\b/i, label: "calcium propionate" },
  { re: /\bsodium\s+propionate\b/i, label: "sodium propionate" },
  { re: /\bsorbic\s+acid\b/i, label: "sorbic acid" },
  { re: /\bpotassium\s+sorbate\b/i, label: "potassium sorbate" },
  { re: /\bedta\b/i, label: "EDTA" },
  { re: /\bcalcium\s+disodium\s+edta\b/i, label: "EDTA" },
  { re: /\bdisodium\s+edta\b/i, label: "EDTA" },

  // Dough conditioners / bleaching
  { re: /\bpotassium\s+bromate\b/i, label: "potassium bromate" },
  { re: /\bazodicarbonamide\b/i, label: "azodicarbonamide" },
  { re: /\bADA\b/, label: "azodicarbonamide" },
  { re: /\bchlorine\s+dioxide\b/i, label: "chlorine dioxide" },
  { re: /\bbenzoyl\s+peroxide\b/i, label: "benzoyl peroxide" },

  // Colors
  { re: /\bred\s*40\b/i, label: "Red 40" },
  { re: /\ballura\s+red\b/i, label: "Red 40" },
  { re: /\byellow\s*5\b/i, label: "Yellow 5" },
  { re: /\btartrazine\b/i, label: "Yellow 5" },
  { re: /\byellow\s*6\b/i, label: "Yellow 6" },
  { re: /\bsunset\s+yellow\b/i, label: "Yellow 6" },
  { re: /\bblue\s*1\b/i, label: "Blue 1" },
  { re: /\bbrilliant\s+blue\b/i, label: "Blue 1" },
  { re: /\bblue\s*2\b/i, label: "Blue 2" },
  { re: /\bgreen\s*3\b/i, label: "Green 3" },
  { re: /\bcaramel\s+colo(?:u)?r\b/i, label: "caramel color" },
  { re: /\bartificial\s+colo(?:u)?rs?\b/i, label: "artificial colors" },
  { re: /\bFD&?C\b/i, label: "FD&C colors" },
  { re: /\bE1(?:0[2-9]|1[0-9]|2[0-9]|3[0-3])\b/i, label: "synthetic color (E-number)" },

  // Sweeteners
  { re: /\baspartame\b/i, label: "aspartame" },
  { re: /\bsucralose\b/i, label: "sucralose" },
  { re: /\bacesulfame\s*-?\s*k(?:alium)?\b/i, label: "acesulfame-K" },
  { re: /\bsaccharin\b/i, label: "saccharin" },
  { re: /\bneotame\b/i, label: "neotame" },
  { re: /\badvantame\b/i, label: "advantame" },
  { re: /\bhigh\s+fructose\s+corn\s+syrup\b/i, label: "high fructose corn syrup" },
  { re: /\bHFCS\b/i, label: "high fructose corn syrup" },
  { re: /\bcorn\s+syrup\s+solids\b/i, label: "corn syrup solids" },
  { re: /\bcorn\s+syrup\b/i, label: "corn syrup" },

  // Emulsifiers / gums / industrial
  { re: /\bcarrageenan\b/i, label: "carrageenan" },
  { re: /\bpolysorbate\s*\d+\b/i, label: "polysorbate" },
  { re: /\bpolysorbate\b/i, label: "polysorbate" },
  { re: /\bsodium\s+stearoyl\s+lactylate\b/i, label: "sodium stearoyl lactylate" },
  { re: /\bdatem\b/i, label: "DATEM" },
  { re: /\bmono-?\s*and\s*diglycerides\b/i, label: "mono- and diglycerides" },
  { re: /\bcarboxymethyl\s*cellulose\b/i, label: "carboxymethyl cellulose" },
  { re: /\bcellulose\s+gum\b/i, label: "cellulose gum" },
  { re: /\bxanthan\s+gum\b/i, label: "xanthan gum" },
  { re: /\bpropylene\s+glycol\b/i, label: "propylene glycol" },
  { re: /\bsodium\s+caseinate\b/i, label: "sodium caseinate" },
  { re: /\bsodium\s+phosphate\b/i, label: "sodium phosphate" },
  { re: /\bdisodium\s+phosphate\b/i, label: "disodium phosphate" },
  { re: /\btrisodium\s+phosphate\b/i, label: "trisodium phosphate" },
  { re: /\bphosphoric\s+acid\b/i, label: "phosphoric acid" },

  // Flavor enhancers
  { re: /\bMSG\b/, label: "MSG" },
  { re: /\bmonosodium\s+glutamate\b/i, label: "MSG" },
  { re: /\bdisodium\s+inosinate\b/i, label: "disodium inosinate" },
  { re: /\bdisodium\s+guanylate\b/i, label: "disodium guanylate" },
  { re: /\byeast\s+extract\b/i, label: "yeast extract" },
  { re: /\bautolyzed\s+yeast\b/i, label: "autolyzed yeast" },
  { re: /\bhydrolyzed\s+(?:vegetable\s+)?protein\b/i, label: "hydrolyzed protein" },
  { re: /\bartificial\s+flavou?rs?\b/i, label: "artificial flavors" },
  { re: /\bnatural\s+and\s+artificial\s+flavou?rs?\b/i, label: "artificial flavors" },

  // Misc concerning
  { re: /\bbrominated\s+vegetable\s+oil\b/i, label: "brominated vegetable oil" },
  { re: /\bBVO\b/, label: "brominated vegetable oil" },
  { re: /\btrans\s+fat\b/i, label: "trans fat" },
  { re: /\bshortening\b/i, label: "shortening" },
  { re: /\bmaltodextrin\b/i, label: "maltodextrin" },
  { re: /\bmodified\s+(?:\w+\s+)?starch\b/i, label: "modified starch" },
  { re: /\bsodium\s+aluminum\s+phosphate\b/i, label: "sodium aluminum phosphate" },
  { re: /\baluminum\s+sulfate\b/i, label: "aluminum sulfate" },
  { re: /\btitanium\s+dioxide\b/i, label: "titanium dioxide" },
  { re: /\bsilicon\s+dioxide\b/i, label: "silicon dioxide" },
];

function uniqueLabels(matches) {
  const seen = new Set();
  const out = [];
  for (const label of matches) {
    const key = String(label || "").toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(label).trim());
  }
  return out;
}

/**
 * @param {string} ingredientsText
 * @returns {{ seedOils: string[], additives: string[] }}
 */
export function extractIngredientFlags(ingredientsText) {
  const text = String(ingredientsText || "").trim();
  if (!text || /^\(none/i.test(text)) {
    return { seedOils: [], additives: [] };
  }

  const seedOils = [];
  for (const { re, label } of SEED_OIL_PATTERNS) {
    if (re.test(text)) seedOils.push(label);
  }

  const additives = [];
  for (const { re, label } of ADDITIVE_PATTERNS) {
    if (re.test(text)) additives.push(label);
  }

  return {
    seedOils: uniqueLabels(seedOils),
    additives: uniqueLabels(additives),
  };
}

/**
 * Merge two flag sets (regex + AI chemical scan).
 */
export function mergeIngredientFlags(a, b) {
  return {
    seedOils: uniqueLabels([...(a?.seedOils || []), ...(b?.seedOils || [])]),
    additives: uniqueLabels([...(a?.additives || []), ...(b?.additives || [])]),
  };
}
