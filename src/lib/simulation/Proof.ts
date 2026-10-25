import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';
import { EvolutionTypeSchema } from './event/EvolutionType';

export type ProofValueKind = 'translation' | 'number' | 'boolean' | 'evolution';

/** The kind of a value (translated text, number, boolean or evolution over time), or undefined when it is none of them. */
export function valueKind(value: unknown): ProofValueKind | undefined {
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'object' && value !== null) {
		if ('fr' in value && 'en' in value) return 'translation';
		if ('evolution' in value && 'unit' in value) return 'evolution';
	}
	return undefined;
}

/**
 * A proof is about ONE value of an element: "value_name" names this value and "desired_value" is the value the
 * proof wants it to have. A text never exists alone in the simulation: it is always translated in every language.
 */
export const ProofSchema = z.object({
	type: z.literal('proof').default('proof').describe('The type of proof'),
	name: TranslationSchema.describe('The name of the proof'),
	description: TranslationSchema.describe('The description of the proof'),
	value_name: z
		.union([TranslationSchema, z.string()])
		.describe(
			'The ONE existing value of the element this proof is about. For a primary property of the element, the exact property key as a plain string (e.g. "description"). For an "other information", its name translated in every language, exactly as in the element.'
		),
	// Not z.any(): its JSON schema has no "type", which strict structured outputs reject.
	desired_value: z
		.union([TranslationSchema, z.number(), z.boolean()])
		.describe(
			'The value this proof wants the value to have. A text is translated in every language (never a plain string). It MUST have the same type as the current value: a number replaces a number, a boolean a boolean, a translated text a translated text, an evolution (a mathjs function of the time t and its unit) an evolution. For the existence of the element, the evolution is a percentage between 0 and 100 with the unit "%".'
		),
	verification_method: TranslationSchema.describe('How to verify the truth of the proof'),
	falsifiability_method: TranslationSchema.describe('How to falsify the truth of the proof'),
	source: z.array(z.string()).default([]).describe('Sources for the proof'),
	veracity: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'The veracity of the proof, as a percentage from 0 to 100 (0 = certainly false, 100 = certainly true). Use the whole scale.'
		),
	uncertainty: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'The uncertainty of the veracity of the proof, as a percentage from 0 to 100: 5 = the veracity is known within about +-5 points, 40 = a rough estimate.'
		),
	impact: z
		.number()
		.describe(
			'The impact of the proof on its value: how strongly it moves the value toward the desired value. Any number: positive when it pushes the value toward the desired value, negative when it pushes it away, 0 for no effect. Its magnitude is not limited.'
		),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the proof compared with other proofs, as a percentage from 0 to 100 (NOT a ratio between 0 and 1): 0 = a copy of something that already exists, 50 = moderately original, 100 = completely new. Use the whole scale, e.g. 35 or 80, never 0.35 or 0.8. It avoids that people spam the same thing and increase the probability of certain things.'
		)
});

/**
 * A proof as stored: the generated content plus the links set by the server
 * (the element of the value and, for a sub-proof, the proof it debates).
 * Every proof, sub-proofs included, has a desired value for its value.
 */
export type ProofData = z.infer<typeof ProofSchema> & {
	id?: string;
	fact_id?: string | null;
	relation_id?: string | null;
	parent_proof_id?: string | null;
};

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
