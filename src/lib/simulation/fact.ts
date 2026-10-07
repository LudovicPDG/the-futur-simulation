import { z } from 'zod';
import { TranslationSchema } from './Translation';
import { ProbabilityDistributionSchema } from './ProbabilityDistribution';

const otherSchema = z.array(
	z.object({
		name: TranslationSchema.describe('The name of one other data of the fact'),
		value: z
			.union([TranslationSchema, z.number(), z.boolean()])
			.describe('The value of one other data of the fact')
	})
);

export const FactSchema = z.object({
	name: TranslationSchema.describe('The name of the fact'),

	type: z
		.enum([
			'person',
			'organization',
			'interest_group',
			'character',
			'evolution',
			'ranking',
			'event',
			'action',
			'material_resource',
			'proof',
			'relation',
			'fact'
		])
		.default('fact')
		.describe('The type of the simulation element'),

	description: TranslationSchema.describe('The description of the fact'),

	other: otherSchema.describe('Other data about the fact').nullable(),

	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility of the fact. This number will after normalize the probability distribution.'
		),

	probability_distribution: ProbabilityDistributionSchema,

	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the fact compared with other facts. Its for avoid that people spam same thing and increase the probability of certain things.'
		)
});

export type FactData = z.infer<typeof FactSchema>;

export interface SvgShapeOptions {
	x?: number;
	y?: number;
	radius?: number;
	color?: string;
	locale?: 'fr' | 'en' | 'de' | 'es';
}
/**
 * Returns SVG markup for rendering a Fact node shape (circle/rond with text)
 */
export function svg_shape(fact: FactData, options: SvgShapeOptions = {}): string {
	const { x = 0, y = 0, radius = 50, color = '#38f842ff', locale = 'fr' } = options;

	let label = 'Fact';

	if (fact.name && typeof fact.name === 'object') {
		label = fact.name[locale] || fact.name.fr || fact.name.en || 'Fact';
	} else if (typeof fact.name === 'string') {
		label = fact.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	return `
		<g
			class="fact-node"
			transform="translate(${x}, ${y})"
			data-type="${fact.type || 'fact'}"
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

			<!-- Cercle principal -->
			<circle
				r="${radius}"
				fill="url(#fact-grad-${Math.floor(x)}-${Math.floor(y)})"
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
