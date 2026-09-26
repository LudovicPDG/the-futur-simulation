import { z } from 'zod';
import { CharacterSchema, character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';

export const PersonSchema = CharacterSchema.extend({
	type: z.literal('person').default('person').describe('The type of person')
});

export type PersonData = z.infer<typeof PersonSchema>;

/**
 * Person SVG Shape:
 * Character base circle + person/user icon above title
 */
export function svg_shape(person: PersonData, options: SvgShapeOptions = {}): string {
	const personIcon = `
		<g class="symbol person-symbol" transform="translate(-10, -26)">
			<circle cx="10" cy="5" r="4.5" fill="#ffffff" />
			<path d="M 2 17 C 2 11.5, 6 11, 10 11 C 14 11, 18 11.5, 18 17" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" />
		</g>
	`;
	return character_svg_shape(person, { color: '#06b6d4', ...options }, personIcon);
}
