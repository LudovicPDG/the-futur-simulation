import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';
import type { TimeRange } from './event/EvolutionFunction';
import { evolutionColumns, type CurveColumns } from './event/EvolutionType';

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
 * A score as it is stored: a function of the time t (the spline of the points the genie gave, as a mathjs
 * expression), whose values are read between 0 and 100, without uncertainty.
 */
const StoredScoreSchema = z.string();

/** An evolution as it is stored: its functions (splines) and its unit. A proof gives one single function. */
const StoredEvolutionSchema = z.object({
	evolution: z.array(
		z.object({
			function: z.string(),
			weight: z.number(),
			uncertainty_down: z.string(),
			uncertainty_up: z.string()
		})
	),
	unit: z.string()
});

/** The scores of a proof and of a value: each one is a curve of the time, given by the genie as points. */
export const SCORE_COLUMNS = {
	veracity: {
		description: 'The veracity at this date: how likely the claim is to be true, from 0 (certainly false) to 100 (certainly true), whatever the confidence of its author. Use the whole scale.',
		min: 0,
		max: 100
	},
	uncertainty: {
		description:
			'The uncertainty of the AUTHOR of the proof at this date: how confident the author is in the claim they make, from 0 (the author is completely certain) to 100 (the author is very unsure, a pure guess). It is completely INDEPENDENT of the veracity: a plausible claim can come from an unsure author (high veracity, high uncertainty), and an absurd claim can come from an author who is completely sure of it (very low veracity, low uncertainty). Never deduce one from the other.',
		min: 0,
		max: 100
	},
	impact: {
		description:
			'The impact at this date: how strongly it moves the value toward the desired value, from 0 (no effect) to 100 (it decides the value). Use the whole scale.',
		min: 0,
		max: 100
	},
	originality: {
		description:
			'The originality at this date compared with the other proofs, as a percentage from 0 to 100 (NOT a ratio between 0 and 1): 0 = a copy of something that already exists, 100 = completely new. It keeps people from spamming the same thing to make it more probable.',
		min: 0,
		max: 100
	}
} satisfies CurveColumns;

export type ScoreField = keyof typeof SCORE_COLUMNS;
export const SCORE_FIELDS = Object.keys(SCORE_COLUMNS) as ScoreField[];

/**
 * The relevance of a proof or of a sub-proof: how strongly it moves what it debates (the value, or the debated proof)
 * toward its desired value. It is the own score of a proof, next to the impact that a value has.
 */
export const RELEVANCE_COLUMN = {
	description:
		'The relevance of the proof at this date: how strongly it moves what it debates toward its desired value, from 0 (no effect) to 100 (it decides it). Use the whole scale.',
	min: 0,
	max: 100
} satisfies CurveColumns[string];

/** The scores of a proof (or of a sub-proof): the ones of a value, with a relevance instead of an impact. */
export const PROOF_SCORE_FIELDS = ['veracity', 'uncertainty', 'relevance', 'originality'] as const;

/**
 * The number of people impacted by a value: a curve of the time from 0 to +infinity, next to its (average) impact. Only
 * a value that has an impact of its own has it: it is a part of the value, never a score of a proof.
 */
export const PEOPLE_IMPACTED_COLUMN = {
	description:
		'The NUMBER OF PEOPLE impacted by this value at this date, from 0 to +infinity (no maximum): a count of people (e.g. 250 or 12000000), not a percentage. It is independent of the average impact on each of them.',
	min: 0
} satisfies CurveColumns[string];

/** The scores of a value: the ones of a proof and the number of people impacted. */
export const VALUE_SCORE_FIELDS: string[] = [...SCORE_FIELDS, 'people_impacted'];

/**
 * The scores the genie draws as curves of the time. The originality is not one of them: it is a single number (not a
 * function), given by the genie after it compared the proof or the value with all the others.
 */
export const CURVE_SCORE_COLUMNS = {
	veracity: SCORE_COLUMNS.veracity,
	uncertainty: SCORE_COLUMNS.uncertainty,
	impact: SCORE_COLUMNS.impact
} satisfies CurveColumns;

/** The scores a proof or a sub-proof draws as curves of the time for ITSELF: its relevance instead of an impact. */
export const PROOF_CURVE_COLUMNS = {
	veracity: SCORE_COLUMNS.veracity,
	uncertainty: SCORE_COLUMNS.uncertainty,
	relevance: RELEVANCE_COLUMN
} satisfies CurveColumns;

/**
 * The curves of a value given as points: the value and its uncertainty above and below for an evolution (it has no
 * general uncertainty), then its scores, with its impact (every value has one). The originality is never a
 * curve (see CURVE_SCORE_COLUMNS).
 */
export function valueColumns(evolution: boolean, scored: boolean): CurveColumns {
	const columns: CurveColumns = evolution ? evolutionColumns() : {};
	for (const field of Object.keys(CURVE_SCORE_COLUMNS) as (keyof typeof CURVE_SCORE_COLUMNS)[]) {
		if (evolution && field === 'uncertainty') continue;
		columns[field] = SCORE_COLUMNS[field];
	}
	// Every value has an impact of its own: its average impact and the number of people it impacts.
	columns.people_impacted = PEOPLE_IMPACTED_COLUMN;
	return columns;
}

/** The field of a value or of a proof that a curve is: the curve "value" of an evolution is its function. */
export const CURVE_FIELDS: Record<string, string> = {
	value: 'function',
	uncertainty_above: 'uncertainty_above',
	uncertainty_below: 'uncertainty_below',
	veracity: 'veracity',
	uncertainty: 'uncertainty',
	impact: 'impact',
	relevance: 'relevance',
	people_impacted: 'people_impacted',
	originality: 'originality'
};

/** For each curve a proof changes, the period it really changes (see changedRange). */
export type EditedRanges = Record<string, TimeRange>;

/**
 * Every part of its value of the element that a top-level proof wants: its content and its scores (functions of t).
 * All of them are always given (a part the proof keeps repeats the current one).
 */
export const ValueEditSchema = z.object({
	value: z.union([TranslationSchema, z.number(), z.boolean(), StoredEvolutionSchema]),
	veracity: StoredScoreSchema,
	uncertainty: StoredScoreSchema,
	impact: StoredScoreSchema,
	/** The number of people impacted, a function of the time from 0 to +infinity (only for a value with its own impact). */
	people_impacted: StoredScoreSchema.optional(),
	originality: StoredScoreSchema
});

/**
 * Every field of the debated proof that a sub-proof wants, except its desired value.
 * All of them are always given (a field the sub-proof keeps repeats the current one).
 */
export const ProofEditSchema = z.object({
	name: TranslationSchema,
	description: TranslationSchema,
	verification_method: TranslationSchema,
	falsifiability_method: TranslationSchema,
	source: z.array(z.string()),
	veracity: StoredScoreSchema,
	uncertainty: StoredScoreSchema,
	relevance: StoredScoreSchema,
	originality: StoredScoreSchema
});

/**
 * The desired value of a value without an originality and an impact: a primary property of the element (name,
 * description, existence...) or a value of a relation (its originality and impact are the relation's).
 */
export const PlainValueEditSchema = ValueEditSchema.omit({ impact: true, originality: true, people_impacted: true });

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
	desired_value: ValueEditSchema,
	verification_method: TranslationSchema.describe('How to verify the truth of the proof'),
	falsifiability_method: TranslationSchema.describe('How to falsify the truth of the proof'),
	source: z.array(z.string()).default([]).describe('Sources for the proof'),
	veracity: StoredScoreSchema,
	uncertainty: StoredScoreSchema,
	relevance: StoredScoreSchema,
	originality: StoredScoreSchema
});

/**
 * A proof as stored: the generated content plus the links set by the server
 * (the element of the value and, for a sub-proof, the proof it debates).
 * The desired value of a top-level proof edits its value, the one of a sub-proof edits the debated proof.
 */
export type ProofData = Omit<z.infer<typeof ProofSchema>, 'desired_value'> & {
	desired_value: ValueEdit | ProofEdit;
	/** The fields of the desired value the proof really changed: only they vote (see ProofResolution). */
	edited_fields?: string[] | null;
	/** For the curves it changes, the period it really changes: only this part of the curve stands out. */
	edited_ranges?: EditedRanges | null;
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
