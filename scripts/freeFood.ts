// Decides whether an event's text says food will be given out.

const FOOD_WORDS = [
  "free food",
  "food provided",
  "food will be",
  "refreshments",
  "snacks",
  "pizza",
  "boba",
  "donuts",
  "cookies",
  "tacos",
  "breakfast",
  "lunch",
  "dinner",
  "catered",
];

// Phrases where food is collected or discussed rather than handed out.
const NOT_GIVEAWAYS = ["food drive", "food pantry", "food insecurity", "canned food", "donate food"];

// Events built around collecting food; they're left out even if the listing also mentions a meal for volunteers.
const FOOD_COLLECTION_TITLE = /food drive|food pantry|canned food|donate food/i;

const foodWordPattern = new RegExp(`\\b(${FOOD_WORDS.join("|")})\\b`, "gi");

/** Returns the distinct food words in `text`, lowercased, in the order they first appear. */
export function findFoodMentions(text: string): string[] {
  let cleaned = text.toLowerCase();
  for (const phrase of NOT_GIVEAWAYS) {
    cleaned = cleaned.replaceAll(phrase, " ");
  }
  const matches = cleaned.match(foodWordPattern) ?? [];
  return [...new Set(matches)];
}

/** True when the event's title says it collects food rather than gives it out, such as a food drive. */
export function isFoodCollection(title: string): boolean {
  return FOOD_COLLECTION_TITLE.test(title);
}
