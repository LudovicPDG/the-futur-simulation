import { z } from 'zod';
import { FactSchema, type SvgShapeOptions } from './fact';
import { EvolutionTypeSchema } from './event/Evolution';
import { TranslationSchema } from './Translation';

export const MaterialResourceSchema = FactSchema.extend({
	type: z
		.literal('material_resource')
		.default('material_resource')
		.describe('The type of material resource'),
	number_of_units: EvolutionTypeSchema.describe('Number of units of the material resource'),
	financial_value: EvolutionTypeSchema.describe('Financial value of the material resource'),
	power: z.array(TranslationSchema).describe('list of what this resource can do')
});

export type MaterialResourceData = z.infer<typeof MaterialResourceSchema>;

/**
 * Material resource SVG shape:
 * Horizontal rectangle with 2:4 aspect ratio (e.g., width = 140, height = 70).
 * Sharp corners (no rounded edges),
 * No interior fill color,
 * One solid-colored outline,
 * No small rotating stroke around it.
 */
export function svg_shape(resource: MaterialResourceData, options: SvgShapeOptions = {}): string {
	const { x = 0, y = 0, color = 'rgb(234, 34, 8)', locale = 'fr' } = options;
	// 2:3 aspect ratio horizontal rectangle: width: 120, height: 80
	const width = 120;
	const height = 60;
	const halfW = width / 2;
	const halfH = height / 2;
	const rx = 14;

	let label = 'Material Resource';

	if (resource.name && typeof resource.name === 'object') {
		label = resource.name[locale] || resource.name.fr || resource.name.en || 'Material Resource';
	} else if (typeof resource.name === 'string') {
		label = resource.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	const gradId = `event-grad-${Math.floor(x)}-${Math.floor(y)}-${Math.floor(Math.random() * 1000)}`;

	return `
		<g
			class="fact-node event-node"
			transform="translate(${x}, ${y})"
			data-type="${resource.type || 'material_resource'}"
		>
			<defs>
				<radialGradient
					id="${gradId}"
					cx="50%"
					cy="50%"
					r="50%"
				>
					<stop offset="0%" stop-color="${color}" stop-opacity="0.6" />
					<stop offset="100%" stop-color="${color}" stop-opacity="0.15" />
				</radialGradient>
			</defs>

			

			<!-- Main rounded rectangle (2:3 aspect ratio) -->
			<rect
				x="${-halfW}"
				y="${-halfH}"
				width="${width}"
				height="${height}"
				fill="url(#${gradId})"
				stroke="${color}"
				stroke-width="2.5"
			/>

			<text
				text-anchor="middle"
				dy="4"
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
