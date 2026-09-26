import { z } from 'zod';
import { EventSchema, event_svg_shape } from './event';
import type { SvgShapeOptions } from '../fact';

export const EvolutionTypeSchema = z.object({
	evolution: z
		.string()
		.describe('The evolution of the unit of this evolution depending of the time t.'),
	unit: z.string().describe('The unit of this evolution')
});

export type EvolutionTypeData = z.infer<typeof EvolutionTypeSchema>;
export type EvolutionType = EvolutionTypeData;

export const EvolutionSchema = EventSchema.extend({
	type: z.literal('evolution').default('evolution').describe('The type of evolution'),
	evolution: z
		.string()
		.describe('The evolution of the unit of this evolution depending of the time t.'),
	unit: z.string().describe('The unit of this evolution')
});

export type EvolutionData = z.infer<typeof EvolutionSchema>;

/**
 * Evolution SVG Shape:
 * Event base rectangle + wave symbol above title
 */
export function svg_shape(evolution: EvolutionData, options: SvgShapeOptions = {}): string {
	const waveIcon = `
		<g class="symbol evolution-symbol" transform="translate(-15, -24)">
			<path
				d="M 0 6 Q 7.5 0, 15 6 T 30 6"
				fill="none"
				stroke="#ffffff"
				stroke-width="2.5"
				stroke-linecap="round"
			/>
		</g>
	`;
	return event_svg_shape(evolution, { color: '#10b981', ...options }, waveIcon);
}
