import { z } from 'zod';
import { FactSchema, type SvgShapeOptions } from './fact';
import { EvolutionTypeSchema } from './event/Evolution';
import { existenceSchema } from './Existence';
import { TranslationSchema } from './Translation';

/** A material resource of an action: like a capability, it has its own title (so a relation or a proof can target it) and its parameters. */
const ActionMaterialResourceSchema = z.object({
	name: TranslationSchema.describe('The short title of the material resource, unique in its list'),
	description: TranslationSchema.describe('The description of the material resource'),
	quantity: EvolutionTypeSchema.describe(
		'The quantity of the material resource, with its unit. Keep it simple: a single constant number (e.g. "5000"), NOT a formula depending on the time t.'
	),
	level_of_wear: EvolutionTypeSchema.describe(
		'The level of wear of the material resource in %. Keep it simple: a single constant number (e.g. "10"), NOT a formula depending on the time t.'
	)
});

// The "necessary" field comes just after the "used" one.
export const ActionSchema = FactSchema.extend({
	type: z.literal('action').default('action').describe('The type of action'),
	existence: existenceSchema('action'),
	material_resource_used: z
		.array(ActionMaterialResourceSchema)
		.default([])
		.describe('Material resources used in the action'),
	material_resource_necessary: z
		.array(ActionMaterialResourceSchema)
		.default([])
		.describe(
			'Material resources necessary to perform the action (the minimum required, whether or not they are currently used)'
		),
	fund_used: EvolutionTypeSchema.describe('Money used in the action'),
	fund_necessary: EvolutionTypeSchema.describe('Money necessary to perform the action'),
	human_mobilized: EvolutionTypeSchema.describe('Number of human mobilized in the action'),
	human_necessary: EvolutionTypeSchema.describe('Number of humans necessary to perform the action')
});

export type ActionData = z.infer<typeof ActionSchema>;

/**
 * Action SVG shape:
 * Diamond (rhombus) shape with middle color and rotating decorative stroke.
 */
export function svg_shape(action: ActionData, options: SvgShapeOptions = {}): string {
	const { x = 0, y = 0, color = '#69f65c', locale = 'fr' } = options;
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
