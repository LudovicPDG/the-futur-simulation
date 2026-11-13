/**
 * When a proof, a relation or an element stops being counted. A score under its threshold takes the thing out of every
 * vote and every average (its weight is 0): the veracity, the originality and the relevance of a proof; the veracity of
 * the value, the certainty of the existence of the elements, the veracity, the existence, the originality and the
 * impact of a relation. The certainty of the existence replaces the veracity for an element.
 */

/** Below this level (in %), a veracity, an originality, an impact or an existence is not counted. */
export const SCORE_THRESHOLD = 10;
/** The impact of a relation is a ratio (Ii = V0 / Vi), not a percentage: its own threshold. */
export const RELATION_IMPACT_THRESHOLD = 0.1;

export type CountedScore = 'veracity' | 'originality' | 'impact' | 'relevance' | 'existence';

/** The scores given, by name; a score that is not given (or not computable) is not checked. */
export type Scores = Partial<Record<CountedScore, number | undefined>>;

/**
 * The scores under their threshold. The impact of a relation is compared in absolute value with its own threshold.
 */
export function belowThreshold(scores: Scores, relationImpact = false): CountedScore[] {
	return (Object.entries(scores) as [CountedScore, number | undefined][])
		.filter(([name, value]) => {
			if (value === undefined || !Number.isFinite(value)) return false;
			if (name === 'impact' && relationImpact) return Math.abs(value) < RELATION_IMPACT_THRESHOLD;
			return value < SCORE_THRESHOLD;
		})
		.map(([name]) => name);
}

/** Whether nothing is under a threshold. */
export function isCounted(scores: Scores, relationImpact = false): boolean {
	return belowThreshold(scores, relationImpact).length === 0;
}
