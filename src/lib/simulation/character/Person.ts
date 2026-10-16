import { z } from 'zod';
import { CharacterSchema, character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';
import { existenceSchema } from '../Existence';

export const PersonSchema = CharacterSchema.extend({
	type: z.literal('person').default('person').describe('The type of person'),
	existence: existenceSchema(
		'person',
		'The existence starts at the BIRTH of the person (the real birth date and time for a living or historical person, 12:00 if the hour is unknown) and ends at their DEATH (the real one for a dead person; for a living person, estimate it from their age and life expectancy and make the end a slow decline over several years).'
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
