import { z } from 'zod';
import { CharacterSchema, character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';
import { ProbabilityDistributionSchema } from '../ProbabilityDistribution';

export const PersonSchema = CharacterSchema.extend({
	type: z.literal('person').default('person').describe('The type of person'),
	start_probability_distribution: ProbabilityDistributionSchema.describe(
		'START of the existence of the person = their BIRTH: the date, hour and minute of birth (for a living or historical person, the real birth date and time; if the hour is unknown use 12:00). Give the exact moment (year, month, day, hour, minute) of the event: it becomes the center of the distribution. Use a very small omega when the moment is documented.'
	),
	end_probability_distribution: ProbabilityDistributionSchema.describe(
		'END of the existence of the person = their DEATH: the date, hour and minute of death for a dead person. For a living person, estimate the death from their age and life expectancy, with a large omega (several years). Give the exact moment (year, month, day, hour, minute) of the event if it is known or planned (otherwise your best estimate, with a larger omega): it becomes the center of the distribution.'
	)
});

export type PersonData = z.infer<typeof PersonSchema>;

/**
 * Person SVG Shape:
 * Character base circle + person/user icon above title
 */
export function svg_shape(person: PersonData, options: SvgShapeOptions = {}): string {
	const personIcon = `
		<g class="symbol person-symbol" transform="translate(-10, -26)">
			<circle cx="10" cy="5" r="4.5" fill="#000000ff" />
			<path d="M 2 17 C 2 11.5, 6 11, 10 11 C 14 11, 18 11.5, 18 17" fill="none" stroke="#000000ff" stroke-width="2.2" stroke-linecap="round" />
		</g>
	`;
	return character_svg_shape(person, { color: '#d42c06ff', ...options }, personIcon);
}
