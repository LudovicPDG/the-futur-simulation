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
export function svg_shape(
	resource: MaterialResourceData,
	options: SvgShapeOptions = {}
): string {
	const { x = 0, y = 0, color = '#14b8a6', locale = 'fr' } = options;
	// 2:4 (1:2) aspect ratio: width = 140, height = 70
	const width = 140;
	const height = 70;
	const halfW = width / 2;
	const halfH = height / 2;

	let label = 'Material Resource';

	if (resource.name && typeof resource.name === 'object') {
		label = resource.name[locale] || resource.name.fr || resource.name.en || 'Material Resource';
	} else if (typeof resource.name === 'string') {
		label = resource.name;
	}

	const shortLabel = label.length > 20 ? label.slice(0, 18) + '…' : label;

	return `
		<g
			class="fact-node material-resource-node"
			transform="translate(${x}, ${y})"
			data-type="${resource.type || 'material_resource'}"
		>
			<!-- Sharp corners, no interior fill, one solid-colored outline, no rotating stroke -->
			<rect
				x="${-halfW}"
				y="${-halfH}"
				width="${width}"
				height="${height}"
				fill="transparent"
				stroke="${color}"
				stroke-width="2.5"
			/>

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
