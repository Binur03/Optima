import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Confirmed by product: gemini-3.6-flash is the standard for low-latency
// multimodal + structured JSON. Fallback covers SDK/API pins to 2.5.
export const GEMINI_MODEL_ID = "gemini-3.6-flash";
export const GEMINI_FALLBACK_MODEL_ID = "gemini-2.5-flash";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Strict schema — the model is constrained to emit exactly this shape.
const MACRO_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    food_name: { type: SchemaType.STRING },
    estimated_calories: { type: SchemaType.NUMBER },
    protein_g: { type: SchemaType.NUMBER },
    carbs_g: { type: SchemaType.NUMBER },
    fat_g: { type: SchemaType.NUMBER },
    confidence: { type: SchemaType.STRING, enum: ["low", "medium", "high"] },
  },
  required: ["food_name", "estimated_calories", "protein_g", "carbs_g", "fat_g"],
} as const;

export interface MacroEstimate {
  food_name: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence?: "low" | "medium" | "high";
}

const IMAGE_PROMPT =
  "You are a nutrition estimator. Analyze the meal in this image and estimate " +
  "calories + macros for the FULL portion shown. Mixed dishes (e.g. Greek yogurt " +
  "with whey, or shredded chicken with sweet potato) must be summed into ONE entry " +
  "with a descriptive name. Return numbers only — no ranges, no units in values. " +
  "Set confidence:'low' when portion size or ingredients are ambiguous.";

// Multimodal: photo + user's text context. The text disambiguates hidden
// ingredients/brands/prep; the photo anchors volume/portion.
const IMAGE_PROMPT_WITH_CONTEXT = (ctx: string) =>
  "You are an expert nutritionist. Analyze the provided image of a meal. The user " +
  `has also provided this context: "${ctx}". Use the text to identify hidden ` +
  "ingredients, specific brands, or preparation methods (like 'cooked in butter' or " +
  "'double meat'). Use the photo primarily to estimate volume and portion size. " +
  "Sum everything into ONE entry with a descriptive name. Return numbers only — no " +
  "ranges, no units in values. Set confidence:'low' when still ambiguous.";

const TEXT_PROMPT = (query: string) =>
  `Estimate calories + macros for a typical single serving of: "${query}". ` +
  "Return numbers only. Set confidence based on how standardized the item is.";

function getModel(modelId: string) {
  return genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MACRO_SCHEMA as unknown as object,
    },
  });
}

// Runs a request against the primary model, retrying once on the fallback
// if the primary model id is rejected (e.g. SDK pinned to an older API).
async function withFallback(
  run: (modelId: string) => Promise<string>
): Promise<MacroEstimate> {
  let text: string;
  try {
    text = await run(GEMINI_MODEL_ID);
  } catch (err) {
    if (isModelNotFound(err)) {
      text = await run(GEMINI_FALLBACK_MODEL_ID);
    } else {
      throw err;
    }
  }
  return sanitize(JSON.parse(text));
}

export async function analyzeMealImage(
  base64Image: string,
  mimeType = "image/jpeg",
  contextText?: string
): Promise<MacroEstimate> {
  const ctx = contextText?.trim();
  const prompt = ctx ? IMAGE_PROMPT_WITH_CONTEXT(ctx) : IMAGE_PROMPT;
  return withFallback(async (modelId) => {
    const result = await getModel(modelId).generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64Image } },
    ]);
    return result.response.text();
  });
}

export async function analyzeFoodText(query: string): Promise<MacroEstimate> {
  return withFallback(async (modelId) => {
    const result = await getModel(modelId).generateContent(TEXT_PROMPT(query));
    return result.response.text();
  });
}

// Defensive: clamp negatives, coerce to finite numbers even under responseSchema.
function sanitize(raw: MacroEstimate): MacroEstimate {
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0;
  };
  return {
    food_name: String(raw.food_name ?? "Unknown item").slice(0, 120),
    estimated_calories: n(raw.estimated_calories),
    protein_g: n(raw.protein_g),
    carbs_g: n(raw.carbs_g),
    fat_g: n(raw.fat_g),
    confidence: raw.confidence ?? "low",
  };
}

function isModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found|404|unsupported model|invalid model/i.test(msg);
}

// ---------- Macro Assistant: meal suggestions ----------
const SUGGESTION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    suggestions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          food: { type: SchemaType.STRING },
          why: { type: SchemaType.STRING },
        },
        required: ["food", "why"],
      },
    },
  },
  required: ["suggestions"],
} as const;

export interface MealSuggestion {
  food: string; // item + concrete portion
  why: string; // approximate macros it contributes
}

export async function suggestMeals(remaining: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): Promise<MealSuggestion[]> {
  const prompt =
    `A user has these remaining daily targets: ${remaining.calories} kcal, ` +
    `${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat. ` +
    "Suggest 2-3 specific, realistic single foods or simple meals with concrete portions " +
    "that together help fill these gaps — prioritize hitting the protein. For each item, " +
    "'food' is the food + portion (e.g. '1.5 cups Greek yogurt + a handful of almonds'), and " +
    "'why' is the approximate macros it adds (e.g. '~30g protein, 12g fat'). Keep it common and practical.";

  const run = async (modelId: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SUGGESTION_SCHEMA as unknown as object,
      },
    });
    return (await model.generateContent(prompt)).response.text();
  };

  let text: string;
  try {
    text = await run(GEMINI_MODEL_ID);
  } catch (err) {
    if (isModelNotFound(err)) text = await run(GEMINI_FALLBACK_MODEL_ID);
    else throw err;
  }

  const parsed = JSON.parse(text) as { suggestions?: MealSuggestion[] };
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((s) => s && typeof s.food === "string" && typeof s.why === "string")
        .slice(0, 3)
    : [];
}

// ---------- Natural-language / voice: multi-item extraction ----------
const ITEMS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          food_name: { type: SchemaType.STRING },
          estimated_calories: { type: SchemaType.NUMBER },
          protein_g: { type: SchemaType.NUMBER },
          carbs_g: { type: SchemaType.NUMBER },
          fat_g: { type: SchemaType.NUMBER },
        },
        required: ["food_name", "estimated_calories", "protein_g", "carbs_g", "fat_g"],
      },
    },
  },
  required: ["items"],
} as const;

const NLP_PROMPT = (text: string) =>
  "You are a nutritional extraction engine. Read the user's meal description and split " +
  "it into individual food items. For EACH item, estimate calories, protein_g, carbs_g, " +
  "and fat_g for the portion described (assume one standard serving when the amount is " +
  'unspecified). Use standard nutrition data. Return numbers only — no ranges, no units. ' +
  `Meal: "${text}"`;

// Parses a free-text/dictated meal into one estimate per food item.
export async function analyzeMealItems(text: string): Promise<MacroEstimate[]> {
  const run = async (modelId: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ITEMS_SCHEMA as unknown as object,
      },
    });
    return (await model.generateContent(NLP_PROMPT(text))).response.text();
  };

  let raw: string;
  try {
    raw = await run(GEMINI_MODEL_ID);
  } catch (err) {
    if (isModelNotFound(err)) raw = await run(GEMINI_FALLBACK_MODEL_ID);
    else throw err;
  }

  const parsed = JSON.parse(raw) as { items?: MacroEstimate[] };
  const items = Array.isArray(parsed.items) ? parsed.items.map(sanitize) : [];
  // Drop empty/zeroed items (e.g. "a black coffee" → all ~0 is fine to keep only
  // if it has a name; but drop rows with no name).
  return items.filter((i) => i.food_name && i.food_name !== "Unknown item");
}
