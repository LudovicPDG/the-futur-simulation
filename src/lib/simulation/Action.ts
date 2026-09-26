import { z } from 'zod';
import { FactSchema, type SvgShapeOptions } from './fact';
import { EvolutionTypeSchema } from './event/Evolution';

const ActionMaterialResourceSchema = z.object({
	name: z.string().describe('The name of the material resource'),
	quantity: EvolutionTypeSchema.describe('The quantity of the material resource'),
	level_of_wear: EvolutionTypeSchema.describe('The level of wear of the material resource')
});

export const ActionSchema = FactSchema.extend({
	type: z.literal('action').default('action').describe('The type of action'),
	material_resource_used: z
		.array(ActionMaterialResourceSchema)
		.default([])
		.describe('Material resources used in the action'),
	fund_used: EvolutionTypeSchema.describe('Money used in the action'),
	human_mobilized: EvolutionTypeSchema.describe('Number of human mobilized in the action')
});

export type ActionData = z.infer<typeof ActionSchema>;

/**
 * Action SVG shape:
 * Diamond (rhombus) shape with middle color and rotating decorative stroke.
 */
export function svg_shape(action: ActionData, options: SvgShapeOptions = {}): string {
	const { x = 0, y = 0, color = '#8b5cf6', locale = 'fr' } = options;
	const halfW = 60;
	const halfH = 50;

	let label = 'Action';

	if (action.name && typeof action.name === 'object') {
		label = action.name[locale] || action.name.fr || action.name.en || 'Action';
	} else if (typeof action.name === 'string') {
		label = action.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	const gradId = `action-grad-${Math.floor(x)}-${Math.floor(y)}-${Math.floor(Math.random() * 1000)}`;

	// Points for diamond
	const outerPoints = `0,${-(halfH + 8)} ${halfW + 8},0 0,${halfH + 8} ${-(halfW + 8)},0`;
	const mainPoints = `0,${-halfH} ${halfW},0 0,${halfH} ${-halfW},0`;
	const innerPoints = `0,${-halfH * 0.65} ${halfW * 0.65},0 0,${halfH * 0.65} ${-halfW * 0.65},0`;

	return `
		<g
			class="fact-node action-node"
			transform="translate(${x}, ${y})"
			data-type="${action.type || 'action'}"
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

			<!-- Rotating decorative stroke around diamond -->
			<polygon
				points="${outerPoints}"
				fill="none"
				stroke="${color}"
				stroke-opacity="0.3"
				stroke-width="1.5"
				stroke-dasharray="6 4"
			>
				<animate
					attributeName="stroke-dashoffset"
					from="0"
					to="-20"
					dur="2.5s"
					repeatCount="indefinite"
				/>
			</polygon>

			<!-- Main diamond (rhombus) -->
			<polygon
				points="${mainPoints}"
				fill="url(#${gradId})"
				stroke="${color}"
				stroke-width="2.5"
				stroke-linejoin="round"
			/>

			<!-- Middle color inner diamond -->
			<polygon
				points="${innerPoints}"
				fill="${color}"
				fill-opacity="0.2"
				stroke-linejoin="round"
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
