import { z } from 'zod';
import { FactSchema, type SvgShapeOptions } from '../fact';
import { EvolutionTypeSchema } from '../event/Evolution';
import { TranslationSchema } from '../Translation';

export const CharacterSchema = FactSchema.extend({
	type: z.string().default('character').describe('The type of character'),
	financial_resource: EvolutionTypeSchema.describe('Financial resource of the character'),
	power: z.array(TranslationSchema).describe('list of what this character can do')
});

export type CharacterData = z.infer<typeof CharacterSchema>;

/**
 * Base character SVG shape:
 * - Simple circle
 * - One solid color
 * - No inner/middle circle
 * - No small rotating stroke around the circle
 * - Optional custom symbol above title
 */
export function character_svg_shape(
	character: CharacterData,
	options: SvgShapeOptions = {},
	symbolSvg: string = ''
): string {
	const { x = 0, y = 0, radius = 50, color = '#3b82f6', locale = 'fr' } = options;

	let label = 'Character';

	if (character.name && typeof character.name === 'object') {
		label = character.name[locale] || character.name.fr || character.name.en || 'Character';
	} else if (typeof character.name === 'string') {
		label = character.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	return `
		<g
			class="fact-node character-node"
			transform="translate(${x}, ${y})"
			data-type="${character.type || 'character'}"
		>
			<!-- Base simple solid circle -->
			<circle
				r="${radius}"
				fill="${color}"
				stroke="${color}"
				stroke-width="2"
			/>

			${symbolSvg}

			<text
				text-anchor="middle"
				dy="${symbolSvg ? '16' : '4'}"
				fill="#ffffff"
				font-size="12"
				font-weight="600"
				font-family="system-ui, -apple-system, sans-serif"
				pointer-events="none"
			>
				${shortLabel}
			</text>
		</g>
	`.trim();
}

export function svg_shape(character: CharacterData, options: SvgShapeOptions = {}): string {
	return character_svg_shape(character, options);
}
