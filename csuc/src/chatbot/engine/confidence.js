import { INTENTS, CONFIDENCE_THRESHOLD } from './intents';

/**
 * Score all intents against a free-text input string.
 * Returns an array sorted by score descending.
 */
export function scoreIntents(input) {
  const lower = (input || '').toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  return INTENTS.map((intent) => {
    let score = 0;

    // Full keyword match — longer matches are worth more
    for (const keyword of intent.keywords) {
      if (lower.includes(keyword)) {
        score += keyword.split(' ').length * 20;
      }
    }

    // Partial word prefix matching for short inputs
    for (const word of words) {
      if (word.length < 3) continue;
      for (const keyword of intent.keywords) {
        if (keyword.startsWith(word) && !lower.includes(keyword)) {
          score += 5;
        }
      }
    }

    return { intent, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Given scored intents, return the resolved intent if confidence
 * clears the threshold; otherwise return null.
 */
export function getResolvedIntent(scores) {
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  if (totalScore === 0) return null;

  const top = scores[0];
  // Combine absolute score and relative dominance for confidence
  const dominance = (top.score / totalScore) * 100;
  const confidence = Math.min(100, dominance + top.score * 0.5);

  if (confidence >= CONFIDENCE_THRESHOLD) {
    return { intent: top.intent, confidence };
  }
  return null;
}

/**
 * Apply a score boost to specific intent ids (used when user picks a choice chip).
 */
export function applyBoost(scores, boostIntentIds, boostAmount = 40) {
  return scores
    .map((s) => ({
      ...s,
      score: boostIntentIds.includes(s.intent.id) ? s.score + boostAmount : s.score,
    }))
    .sort((a, b) => b.score - a.score);
}
