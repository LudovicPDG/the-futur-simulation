import { z } from 'zod';
import { EventSchema, event_svg_shape } from './event';
import type { SvgShapeOptions } from '../fact';
import { isValidEvolutionFunction } from './EvolutionFunction';

export const EvolutionComponentSchema = z.object({
	function: z
		.string()
		.refine(isValidEvolutionFunction, 'Not a valid mathjs expression of t')
		.describe(
			'A mathjs expression of the time t, where t is the calendar year as a decimal number (2026.75 = October 2026). It gives the value of the unit at time t, e.g. "100 * 1.03^(t - 2026)", "50 + 20 * tanh((t - 2035) / 5)", "80 + 6 * sin(2 * pi * t)". Only use t, numbers, + - * / ^, and mathjs functions (exp, log, sqrt, sin, tanh, min, max...).'
		),
	weight: z.number().positive().describe('The weight of this function in the mix of functions.')
});

export const EvolutionFunctionSchema = z
	.array(EvolutionComponentSchema)
	.min(1)
	.describe(
		'The evolution of the unit depending on the time t, as a weighted mix of mathematical functions. Almost always use ONE single component (weight 1) with the simplest function that describes the evolution. The mixture exists for later use: do not split an evolution into many base functions.'
	);

export const EvolutionTypeSchema = z.object({
	evolution: EvolutionFunctionSchema,
	unit: z.string().describe('The unit of this evolution')
});

export type EvolutionTypeData = z.infer<typeof EvolutionTypeSchema>;
export type EvolutionType = EvolutionTypeData;

export const EvolutionSchema = EventSchema.extend({
	type: z.literal('evolution').default('evolution').describe('The type of evolution'),
	evolution: EvolutionFunctionSchema,
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
				stroke="#000000ff"
				stroke-width="2.5"
				stroke-linecap="round"
			/>
		</g>
	`;
	return event_svg_shape(evolution, { color: '#10b981', ...options }, waveIcon);
}
