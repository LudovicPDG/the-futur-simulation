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

export function character_svg_shape(
	character: CharacterData,
	options: SvgShapeOptions = {},
	symbolSvg: string = ''
): string {
	const { x = 0, y = 0, radius = 50, color = '#44f63bff', locale = 'fr' } = options;

	let label = 'Character';

	if (character.name && typeof character.name === 'object') {
		label = character.name[locale] || character.name.fr || character.name.en || 'Character';
	} else if (typeof character.name === 'string') {
		label = character.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	return `
		<g
			class="fact-node"
			transform="translate(${x}, ${y})"
			data-type="${character.type || 'character'}"
		>
			<defs>
				<radialGradient
					id="fact-grad-${Math.floor(x)}-${Math.floor(y)}"
					cx="50%"
					cy="50%"
					r="50%"
				>
					<stop
						offset="0%"
						stop-color="${color}"
						stop-opacity="0.6"
					/>
					<stop
						offset="100%"
						stop-color="${color}"
						stop-opacity="0.1"
					/>
				</radialGradient>
			</defs>

			<!-- Petits traits qui tournent autour du cercle -->
			<circle
				r="${radius + 6}"
				fill="none"
				stroke="${color}"
				stroke-opacity="0.25"
				stroke-width="1.5"
				stroke-dasharray="4 3"
			>
				<animate
					attributeName="stroke-dashoffset"
					from="0"
					to="-14"
					dur="2s"
					repeatCount="indefinite"
				/>
			</circle>

			<!-- Cercle principal -->
			<circle
				r="${radius}"
				fill="url(#fact-grad-${Math.floor(x)}-${Math.floor(y)})"
				stroke="${color}"
				stroke-width="2.5"
			/>

			<!-- Cercle intérieur -->
			<circle
				r="${radius * 0.75}"
				fill="${color}"
				fill-opacity="0.2"
			/>

			${symbolSvg}

			<text
				text-anchor="middle"
				dy="0.35em"
				fill="#f8fafc"
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
