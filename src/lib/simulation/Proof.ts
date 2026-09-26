import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';

export const ProofSchema = z.object({
	type: z.literal('proof').default('proof').describe('The type of proof'),
	name: TranslationSchema.describe('The name of the proof'),
	description: TranslationSchema.describe('The description of the proof'),
	new_value: z.any().describe('The new value of the element'),
	verification_method: TranslationSchema.describe('How to verify the truth of the proof'),
	falsifiability_method: TranslationSchema.describe('How to falsify the truth of the proof'),
	source: z.array(z.string()).default([]).describe('Sources for the proof'),
	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility that the proof happen. This number will after normalize the probability distribution.'
		),
	probability_distribution: z
		.string()
		.describe(
			'The probability distribution of the proof happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the proof happen. Give the expression of the function that describe the probability distribution.'
		),
	originality: z.number().min(0).max(100).describe('Originality of the proof')
});

export type ProofData = z.infer<typeof ProofSchema>;

/**
 * Proof SVG shape
 */
export function svg_shape(proof: ProofData, options: SvgShapeOptions = {}): string {
	const { x = 0, y = 0, color = '#6366f1', locale = 'fr' } = options;
	const radius = 45;

	let label = 'Proof';
	if (proof.name && typeof proof.name === 'object') {
		label = proof.name[locale] || proof.name.fr || proof.name.en || 'Proof';
	} else if (typeof proof.name === 'string') {
		label = proof.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	return `
		<g
			class="fact-node proof-node"
			transform="translate(${x}, ${y})"
			data-type="proof"
		>
			<polygon
				points="0,-${radius} ${radius * 0.9},-${radius * 0.5} ${radius * 0.9},${radius * 0.5} 0,${radius} -${radius * 0.9},${radius * 0.5} -${radius * 0.9},-${radius * 0.5}"
				fill="${color}"
				fill-opacity="0.3"
				stroke="${color}"
				stroke-width="2"
			/>
			<text
				text-anchor="middle"
				dy="0.35em"
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
