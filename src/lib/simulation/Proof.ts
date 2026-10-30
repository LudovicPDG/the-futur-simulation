import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';
import { EvolutionFunctionSchema, EvolutionTypeSchema } from './event/EvolutionType';

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

const scores = {
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
		.min(0)
		.max(100)
		.describe(
			'The impact of the proof on its value: how strongly it moves the value toward the desired value, as a number from 0 (no effect) to 100 (it decides the value). Use the whole scale, e.g. 35 or 80.'
		),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the proof compared with other proofs, as a percentage from 0 to 100 (NOT a ratio between 0 and 1): 0 = a copy of something that already exists, 50 = moderately original, 100 = completely new. Use the whole scale, e.g. 35 or 80, never 0.35 or 0.8. It avoids that people spam the same thing and increase the probability of certain things.'
		)
};

/** The scores of a value of an element: what a founding proof adds next to the content of the value. */
export const ValueScoresSchema = z.object({
	veracity: z
		.number()
		.min(0)
		.max(100)
		.describe('The veracity of the value, as a percentage from 0 (certainly false) to 100 (certainly true).'),
	uncertainty: z
		.number()
		.min(0)
		.max(100)
		.describe('The uncertainty of the veracity of the value, as a percentage from 0 to 100 (5 = known within about +-5 points).'),
	impact: z
		.number()
		.min(0)
		.max(100)
		.describe('The impact of the value, from 0 (no effect) to 100 (decisive).'),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe('The originality of the value, as a percentage from 0 (a copy of an existing one) to 100 (completely new).')
});

/** A proof gives one single function, and the best proof of a value decides it: a value is never a mix of proofs. */
const ProofEvolutionSchema = EvolutionTypeSchema.extend({
	evolution: EvolutionFunctionSchema.describe(
		'The evolution this proof wants, as a function of the time t: EXACTLY ONE component with the weight 1, never a mix of functions. A hypothesis mixing several scenarios is written as one single function.'
	)
});

/**
 * Every part of its value of the element that a top-level proof wants: its content and its scores.
 * All of them are always given (a part the proof keeps repeats the current one).
 */
export const ValueEditSchema = z.object({
	// Not z.any(): its JSON schema has no "type", which strict structured outputs reject.
	value: z
		.union([TranslationSchema, z.number(), z.boolean(), ProofEvolutionSchema])
		.describe(
			'The content this proof wants the value to have (the current content if it keeps it). A text is translated in every language (never a plain string). It MUST have the same type as the current value: a number replaces a number, a boolean a boolean, a translated text a translated text, an evolution (ONE mathjs function of the time t and its unit) an evolution. For the existence of the element, the evolution is a percentage between 0 and 100 with the unit "%".'
		),
	veracity: ValueScoresSchema.shape.veracity.describe('The veracity this proof wants for the value.'),
	uncertainty: ValueScoresSchema.shape.uncertainty.describe('The uncertainty this proof wants for the value.'),
	impact: ValueScoresSchema.shape.impact.describe('The impact this proof wants for the value.'),
	originality: ValueScoresSchema.shape.originality.describe('The originality this proof wants for the value.')
});

/**
 * Every field of the debated proof that a sub-proof wants, except its desired value.
 * All of them are always given (a field the sub-proof keeps repeats the current one).
 */
export const ProofEditSchema = z.object({
	name: TranslationSchema.describe('The name this sub-proof wants for the debated proof (the current one if it keeps it).'),
	description: TranslationSchema.describe('The description this sub-proof wants for the debated proof (the current one if it keeps it).'),
	verification_method: TranslationSchema.describe('The verification method this sub-proof wants for the debated proof (the current one if it keeps it).'),
	falsifiability_method: TranslationSchema.describe('The falsifiability method this sub-proof wants for the debated proof (the current one if it keeps it).'),
	source: z.array(z.string()).describe('The whole list of sources this sub-proof wants for the debated proof (the current ones if it keeps them).'),
	veracity: scores.veracity.describe('The veracity this sub-proof wants for the debated proof.'),
	uncertainty: scores.uncertainty.describe('The uncertainty this sub-proof wants for the debated proof.'),
	impact: scores.impact.describe('The impact this sub-proof wants for the debated proof.'),
	originality: scores.originality.describe('The originality this sub-proof wants for the debated proof.')
});

/**
 * The desired value of a value without an originality and an impact: a primary property of the element (name,
 * description, existence...) or a value of a relation (its originality and impact are the relation's).
 */
export const PlainValueEditSchema = ValueEditSchema.omit({ impact: true, originality: true });

export type ValueEdit = z.infer<typeof ValueEditSchema> | z.infer<typeof PlainValueEditSchema>;
export type ProofEdit = z.infer<typeof ProofEditSchema>;

/**
 * A top-level proof is about ONE value of an element: "value_name" names this value and "desired_value" holds every
 * part of it that the proof edits (its content and its scores). A text never exists alone in the simulation: it is
 * always translated in every language.
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
	desired_value: ValueEditSchema.describe(
		'Every part this proof wants for its value: its content and its scores. Give all of them, never leave one out.'
	),
	verification_method: TranslationSchema.describe('How to verify the truth of the proof'),
	falsifiability_method: TranslationSchema.describe('How to falsify the truth of the proof'),
	source: z.array(z.string()).default([]).describe('Sources for the proof'),
	...scores
});

/** A sub-proof debates a proof: its desired value holds every field of the debated proof it edits. */
export const SubProofSchema = ProofSchema.extend({
	desired_value: ProofEditSchema.describe(
		'Every field this sub-proof wants for the debated proof (never its desired value). Give all of them, never leave one out.'
	)
});

/**
 * A proof as stored: the generated content plus the links set by the server
 * (the element of the value and, for a sub-proof, the proof it debates).
 * The desired value of a top-level proof edits its value, the one of a sub-proof edits the debated proof.
 */
export type ProofData = Omit<z.infer<typeof ProofSchema>, 'desired_value'> & {
	desired_value: ValueEdit | ProofEdit;
	/** The fields of the desired value the proof really changed: the others repeat what it kept. */
	edited_fields?: string[] | null;
	id?: string;
	fact_id?: string | null;
	relation_id?: string | null;
	parent_proof_id?: string | null;
	/** Set on the copy of a debated proof, shown among its sub-proofs: the id of the proof it copies. */
	original_proof_id?: string | null;
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
