import { z } from 'zod';
import { EventSchema, event_svg_shape } from './event';
import { EvolutionTypeSchema } from './Evolution';
import { TranslationSchema } from '../Translation';
import type { SvgShapeOptions } from '../fact';

const RankingElementSchema = z.object({
	name: TranslationSchema.describe('The name of the entity that is ranked'),
	description: TranslationSchema.describe('The description of the entity that is ranked'),
	value: EvolutionTypeSchema.describe('The value of the entity that is ranked')
});

export type RankingElementData = z.infer<typeof RankingElementSchema>;

export const RankingSchema = EventSchema.extend({
	type: z.literal('ranking').default('ranking').describe('The type of ranking'),
	rankings: z.array(RankingElementSchema).describe('The rankings elements of the ranking')
});

export type RankingData = z.infer<typeof RankingSchema>;

/**
 * Ranking SVG Shape:
 * Event base rectangle + podium / ranking symbol above title
 */
export function svg_shape(ranking: RankingData, options: SvgShapeOptions = {}): string {
	const rankingIcon = `
		<g class="symbol ranking-symbol" transform="translate(-15, -27)">
			<!-- 2nd place bar -->
			<rect x="2" y="6" width="7" height="12" rx="1" fill="#ffffff" fill-opacity="0.9" />
			<!-- 1st place bar -->
			<rect x="11" y="2" width="8" height="16" rx="1" fill="#ffffff" />
			<!-- 3rd place bar -->
			<rect x="21" y="9" width="7" height="9" rx="1" fill="#ffffff" fill-opacity="0.8" />
		</g>
	`;
	return event_svg_shape(ranking, { color: '#f59e0b', ...options }, rankingIcon);
}
