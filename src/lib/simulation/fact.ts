import { z } from 'zod';
import { TranslationSchema } from './Translation';

const otherSchema = z.array(
	z.object({
		name: z.string().describe('The name of one other data of the fact'),
		value: z
			.union([z.string(), z.number(), z.boolean()])
			.describe('The value of one other data of the fact')
	})
);

export const FactSchema = z.object({
	name: TranslationSchema.describe('The name of the fact'),

	type: z.string().default('fact').describe('The type of the fact'),

	description: TranslationSchema.describe('The description of the fact'),

	other: otherSchema.describe('Other data about the fact').nullable(),

	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility of the fact. This number will after normalize the probability distribution.'
		),

	probability_distribution: z
		.string()
		.describe(
			'The probability distribution of the fact happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the fact happen. Give the expression of the function that describe the probability distribution.'
		),

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
	const { x = 0, y = 0, radius = 50, color = '#38bdf8', locale = 'fr' } = options;

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
