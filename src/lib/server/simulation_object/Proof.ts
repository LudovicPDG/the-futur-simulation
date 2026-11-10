import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BaseSimulationObject } from './BaseSimulationObject';
import {
	CURVE_FIELDS,
	CURVE_SCORE_COLUMNS,
	ProofSchema,
	SCORE_COLUMNS,
	SCORE_FIELDS,
	valueColumns,
	valueKind,
	type EditedRanges,
	type ProofData,
	type ProofEdit,
	type ValueEdit
} from '$lib/simulation/Proof';
import { TranslationSchema } from '$lib/simulation/Translation';
import {
	EVOLUTION_PARTS,
	PROOF_EDIT_FIELDS,
	VALUE_EDIT_FIELDS,
	VALUE_LISTS,
	resolveElement,
	resolveProofs,
	resolveValueFunctions,
	valueNames
} from '$lib/simulation/ProofResolution';
import {
	buildEvolutionFunction,
	changedRange,
	combineEvolution,
	editSpline,
	isValidUncertaintyFunction,
	parseEvolutionFunction,
	parseSpline,
	toScoreFunction,
	type EvolutionComponent
} from '$lib/simulation/event/EvolutionFunction';
import {
	curveEdit,
	curveExpression,
	curvesSchema,
	type CurveColumns,
	type CurvesInput
} from '$lib/simulation/event/EvolutionType';
import { dateToYear } from '$lib/simulation/TimeAxis';
import {
	RELATION_LIST_FIELDS,
	relationValueName,
	relationValues,
	type RelationData
} from '$lib/simulation/Relation';
import { RelationServer } from './Relation';
import { convertToPg } from './PgConversion';
import { db } from '../utils/database';

/** The element a proof is about: a fact (or subtype) or a relation. */
type ProofTarget = { factId: string } | { relationId: string };

/** The tables of the types of facts: each row holds the values of its type for the fact with the same id. */
const FACT_TYPE_TABLES = [
	'characters',
	'persons',
	'organizations',
	'interest_groups',
	'events',
	'evolutions',
	'rankings',
	'actions',
	'material_resources'
] as const;

/** How many founding proofs are generated at the same time. */
const FOUNDING_PROOF_CONCURRENCY = 4;

/** The texts of a proof, as the genie writes them. */
const ProofTextSchema = ProofSchema.pick({
	type: true,
	name: true,
	description: true,
	verification_method: true,
	falsifiability_method: true,
	source: true
});

/** The own scores of a proof over time, given as interpolation points. */
const OwnScoresSchema = curvesSchema(CURVE_SCORE_COLUMNS).describe(
	'The scores of THIS proof over time (its veracity, the uncertainty of its author, independent of the veracity, and its impact), as interpolation points at the dates that matter: a proof is stronger or weaker as time passes, as the facts become known, forgotten or confirmed. Do not give its originality: it is decided afterwards by comparing the proof with the other ones.'
);

/**
 * The own scores of a generated proof, as functions of the time. The originality is not a function: it is a single
 * number that the genie gives afterwards (see proofOriginality), 50 until then.
 */
function ownScores(scores: CurvesInput): Pick<ProofData, 'veracity' | 'uncertainty' | 'impact' | 'originality'> {
	return {
		veracity: curveExpression(scores, 'veracity'),
		uncertainty: curveExpression(scores, 'uncertainty'),
		impact: curveExpression(scores, 'impact'),
		originality: '50'
	};
}

/** The scores of a value as curves (an evolution has no general uncertainty, see valueColumns). */
function scoreColumns(evolution: boolean, scored: boolean): CurveColumns {
	return Object.fromEntries(
		Object.entries(valueColumns(evolution, scored)).filter(([key]) => (SCORE_FIELDS as string[]).includes(key))
	);
}

/** The content of a founding proof: the value itself is added afterwards, the proof gives the scores it adds with it. */
function foundingSchema(scored: boolean, evolution: boolean) {
	return ProofTextSchema.extend({
		scores: OwnScoresSchema,
		desired_value: curvesSchema(scoreColumns(evolution, scored)).describe(
			'The scores this founding proof adds to its value over time, as interpolation points at the dates that matter.'
		)
	});
}

/** The fields of a debated proof that a sub-proof changes as a whole (its scores are curves, changed by period). */
const TEXT_EDIT_FIELDS = ['name', 'description', 'verification_method', 'falsifiability_method', 'source'] as const;

type GeneratedText = z.infer<typeof ProofTextSchema> & { value_name: ProofData['value_name']; scores: CurvesInput };

/** A top-level proof as generated: its desired value gives only what it changes of the value. */
type GeneratedProof = GeneratedText & {
	desired_value: { content?: unknown; unit?: string | null; curves: CurvesInput };
};

/** A sub-proof as generated: its desired value gives only the fields of the debated proof it changes. */
type GeneratedSubProof = GeneratedText & {
	desired_value: Partial<Record<(typeof TEXT_EDIT_FIELDS)[number], unknown>> & { scores: CurvesInput };
};

/** What a proof or a sub-proof is, for the genie that compares it with the others: its texts and what it changes. */
function proofSummary(proof: Partial<ProofData>) {
	const desired = (proof.desired_value ?? {}) as Record<string, unknown>;
	return {
		name: proof.name,
		description: proof.description,
		verification_method: proof.verification_method,
		falsifiability_method: proof.falsifiability_method,
		source: proof.source,
		value_name: proof.value_name,
		changes: Object.fromEntries(
			(proof.edited_fields ?? []).flatMap((field) =>
				!(SCORE_FIELDS as string[]).includes(field) && field in desired ? [[field, desired[field]]] : []
			)
		)
	};
}

/** What a generated proof or sub-proof changes (its content, its texts), without the curves it draws. */
function proposedChanges(proposed: unknown): Record<string, unknown> {
	const { curves: _curves, scores: _scores, unit: _unit, ...changes } = proposed as Record<string, unknown>;
	return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null && value !== undefined));
}

/** The kind of a value, as far as its curves go: an evolution, another content, or not known yet (free prompt). */
type ValueShape = 'evolution' | 'other' | 'any';

/**
 * A top-level proof as the genie writes it: its desired value gives the content it changes (null to keep it) and, in
 * "curves", the interpolation points of the period it changes for the curves it changes.
 */
function generatedProofSchema(shape: ValueShape, scored: boolean, valueless = false) {
	const columns =
		shape === 'any'
			? { ...valueColumns(true, scored), uncertainty: SCORE_COLUMNS.uncertainty }
			: valueColumns(shape === 'evolution', scored);
	const desired: Record<string, z.ZodType> = {};
	if (shape !== 'evolution' && !valueless) {
		desired.content = z
			.union([TranslationSchema, z.number(), z.boolean()])
			.nullable()
			.describe(
				`The content this proof wants the value to have, or null to keep the current one. It MUST have the same type as the current value: a number replaces a number, a boolean a boolean, a translated text a translated text (never a plain string).${shape === 'any' ? ' Null for an evolution: its curves are in "curves".' : ''}`
			);
	}
	if (shape !== 'other') {
		desired.unit = z.string().nullable().describe('The unit of the evolution, or null to keep the current one.');
	}
	desired.curves = curvesSchema(columns, true).describe(
		`What this proof changes in the curves of the value over time${shape === 'other' ? ' (its scores)' : ' (the value of the evolution, its uncertainty above and below, and the scores of the value)'}: the interpolation points of the period it changes, with a number only for the curves it changes. A proof about the 1990s gives points in the 1990s only; the rest of every curve stays as it is.`
	);
	return ProofTextSchema.extend({
		value_name: ProofSchema.shape.value_name,
		scores: OwnScoresSchema,
		desired_value: z
			.object(desired)
			.describe(
				'Only what this proof changes in its value; everything it leaves null or does not give keeps its current value exactly.'
			)
	});
}

const GeneratedSubProofSchema = ProofTextSchema.extend({
	value_name: ProofSchema.shape.value_name,
	scores: OwnScoresSchema,
	desired_value: z
		.object({
			name: TranslationSchema.nullable().describe('The name this sub-proof wants for the debated proof, or null to keep it.'),
			description: TranslationSchema.nullable().describe(
				'The description this sub-proof wants for the debated proof, or null to keep it.'
			),
			verification_method: TranslationSchema.nullable().describe(
				'The verification method this sub-proof wants for the debated proof, or null to keep it.'
			),
			falsifiability_method: TranslationSchema.nullable().describe(
				'The falsifiability method this sub-proof wants for the debated proof, or null to keep it.'
			),
			source: z
				.array(z.string())
				.nullable()
				.describe('The whole list of sources this sub-proof wants for the debated proof, or null to keep them.'),
			scores: curvesSchema(CURVE_SCORE_COLUMNS, true).describe(
				'What this sub-proof changes in the scores of the DEBATED proof over time (veracity, uncertainty, impact; never its originality): the interpolation points of the period it changes, with a number only for the scores it changes. The rest of every score stays as it is.'
			)
		})
		.describe(
			'Only the fields of the debated proof this sub-proof changes (never its desired value); null for every field it keeps.'
		)
});

/** The function of an evolution (an expression of t), to compute the value v of its uncertainty. */
function valueFunction(expression: string | undefined): ((t: number) => number) | undefined {
	if (!expression) return undefined;
	return buildEvolutionFunction([{ function: expression, weight: 1, uncertainty_down: '0', uncertainty_up: '0' }]);
}

/**
 * The curves after a proof: each curve it gives points for is edited over their period (see editSpline). Returns the
 * new functions, the fields they are (see CURVE_FIELDS) and the period each one really changes.
 */
function applyCurves(
	curves: CurvesInput,
	columns: CurveColumns,
	current: Record<string, string>
): { functions: Record<string, string>; fields: string[]; ranges: EditedRanges } {
	const functions = { ...current };
	const fields: string[] = [];
	const ranges: EditedRanges = {};
	// The value first: an uncertainty is read with the value of the function at each moment.
	const keys = Object.keys(columns).sort((a, b) => Number(b === 'value') - Number(a === 'value'));
	for (const key of keys) {
		const edit = curveEdit(curves, key);
		if (!edit || current[key] === undefined) continue;
		const distance = columns[key].kind === 'distance';
		const next = editSpline(current[key], edit, distance ? isValidUncertaintyFunction : undefined);
		const range = changedRange(current[key], next, distance ? valueFunction(functions.value) : undefined);
		if (!range) continue;
		functions[key] = next;
		fields.push(CURVE_FIELDS[key]);
		ranges[CURVE_FIELDS[key]] = range;
	}
	return { functions, fields, ranges };
}

/** The curves of a value or of a debated proof as they stand, by column: the function of an evolution and the scores. */
function currentCurves(kept: ValueEdit | ProofEdit): Record<string, string> {
	const curves: Record<string, string> = {};
	const value = (kept as { value?: unknown }).value;
	if (valueKind(value) === 'evolution') {
		const components = parseEvolutionFunction((value as Evolution).evolution);
		if (components) {
			const one = combineEvolution(components);
			curves.value = one.function;
			curves.uncertainty_above = one.uncertainty_up;
			curves.uncertainty_below = one.uncertainty_down;
		}
	}
	for (const field of SCORE_FIELDS) {
		const score = (kept as Record<string, unknown>)[field];
		if (score !== null && score !== undefined) curves[field] = toScoreFunction(score);
	}
	return curves;
}

/** The curves as the genie reads them: the points and the extrapolations of a spline, the expression of a mix. */
function describeCurves(curves: Record<string, string>): string {
	return JSON.stringify(
		Object.fromEntries(
			Object.entries(curves).map(([key, expression]) => {
				const spline = parseSpline(expression);
				return [key, spline ? { points: spline.points, before: spline.before, after: spline.after } : { expression }];
			})
		)
	);
}

type ProofValue = NonNullable<ValueEdit['value']>;

/** A proof gives one single function: an evolution with several (saved like that, or a mixed element) is combined. */
function withOneFunction<T>(value: T): T {
	if (valueKind(value) !== 'evolution') return value;
	const components = parseEvolutionFunction((value as { evolution: unknown }).evolution);
	return components && components.length > 1 ? { ...value, evolution: [combineEvolution(components)] } : value;
}

/** Values saved as a plain string (before texts had to be translated) are repeated in every language. */
function toProofValue(value: unknown): ProofValue | undefined {
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return { fr: value, en: value, de: value, es: value };
	return valueKind(value) ? withOneFunction(value as ProofValue) : undefined;
}

/**
 * The stored desired value, complete. A desired value saved before it held every field was the content alone, or
 * left out (null) what it kept: the missing fields are those it kept, from the proof itself for a top-level proof
 * (its scores were the ones of its value) and from the debated proof for a sub-proof.
 */
function toDesiredValue(
	stored: unknown,
	kept: ValueEdit | ProofEdit
): ProofData['desired_value'] {
	const isEdit = typeof stored === 'object' && stored !== null && 'veracity' in stored;
	const given = isEdit
		? Object.fromEntries(Object.entries(stored).filter(([, value]) => value !== null))
		: 'value' in kept
			? { value: toProofValue(stored) }
			: {};
	const desired = { ...kept, ...given } as Record<string, unknown>;
	if ('value' in desired) desired.value = withOneFunction(desired.value);
	// A score saved before the scores were functions of the time is a number.
	for (const score of SCORE_FIELDS) {
		if (score in desired) desired[score] = toScoreFunction(desired[score]);
	}
	return desired as ProofData['desired_value'];
}

/** The fields of a generated desired value that the proof really changed: the ones it did not leave null. */
function changedFields(desired: object): string[] {
	return Object.entries(desired)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key]) => key);
}

/**
 * The fields changed by a proof saved before they were stored: every part of its value for a top-level proof, and
 * for a sub-proof the fields whose desired value differs from the debated proof before its debate.
 */
function legacyEditedFields(proof: ProofData, before: ProofData | undefined): string[] | null {
	if (proof.original_proof_id) return null;
	if (!proof.parent_proof_id || !before) return [...VALUE_EDIT_FIELDS];
	const desired = proof.desired_value as Record<string, unknown>;
	return PROOF_EDIT_FIELDS.filter(
		(field) => JSON.stringify(desired[field]) !== JSON.stringify((before as Record<string, unknown>)[field])
	);
}

/** The fields of a proof that a sub-proof can change, as they stand. */
function proofFields(proof: ProofData): ProofEdit {
	return {
		name: proof.name,
		description: proof.description,
		verification_method: proof.verification_method,
		falsifiability_method: proof.falsifiability_method,
		source: proof.source,
		veracity: proof.veracity,
		uncertainty: proof.uncertainty,
		impact: proof.impact,
		originality: proof.originality
	};
}

/** The entries of the named value among the lists of the element: their title is the name of the value. */
function findListEntry(name: unknown, element: Record<string, unknown>): { value: unknown } | undefined {
	const names = valueNames(name);
	for (const [list, valueKey] of VALUE_LISTS) {
		const entries = Array.isArray(element[list]) ? (element[list] as unknown[]) : [];
		const match = entries.find(
			(item) =>
				typeof item === 'object' &&
				item !== null &&
				valueNames((item as { name?: unknown }).name).some((candidate) => names.includes(candidate))
		);
		if (match) return { value: (match as Record<string, unknown>)[valueKey] };
	}
	return undefined;
}

/** Whether the element has the named value: a primary property, one of its "other" values or one of its titled items. */
function hasValue(name: unknown, element: Record<string, unknown>): boolean {
	return valueNames(name).some((candidate) => candidate in element) || findListEntry(name, element) !== undefined;
}

/** The current value of a primary property of the element, of one of its "other" values or of one of its titled items. */
function findOriginalValue(name: unknown, element: Record<string, unknown>): unknown {
	const key = valueNames(name).find((candidate) => candidate in element);
	if (key) return element[key];
	return findListEntry(name, element)?.value;
}

/** The current content of the value. An evolution element holds its functions and its unit side by side: one value. */
function rawValue(name: unknown, element: Record<string, unknown>): unknown {
	const found = findOriginalValue(name, element);
	return Array.isArray(found) && typeof element.unit === 'string' && valueNames(name).includes('evolution')
		? { evolution: found, unit: element.unit }
		: found;
}

/** The scores of a value that has no proof yet, only to show its curves to the genie. */
const DEFAULT_SCORES = { veracity: '50', uncertainty: '50', impact: '50', originality: '50' };

/** Describes why the value of a proof does not fit its element: an unknown value or a desired content of another type. */
function findDesiredValueError(
	proof: { value_name: ProofData['value_name']; desired_value: object },
	element: Record<string, unknown>
): string | undefined {
	const label = valueNames(proof.value_name)[0];
	if (!hasValue(proof.value_name, element)) {
		return `the value "${label}" does not exist in the element. A proof is about ONE existing value: use the exact key of a primary property or the exact name of an "other information".`;
	}
	// A sub-proof edits the debated proof, not the content of the value; a proof may also keep the content.
	const content = (proof.desired_value as { value?: unknown }).value;
	if (content === undefined || content === null) return undefined;
	const originalKind = valueKind(findOriginalValue(proof.value_name, element));
	const desiredKind = valueKind(content);
	if (originalKind && originalKind !== desiredKind) {
		return `the value "${label}" is a ${originalKind}, but you gave a ${desiredKind ?? 'value of another type'}. The desired value must keep the type of the current value (a text stays a text translated in every language).`;
	}
	return undefined;
}

/** Keys of an element that are not values to give a founding proof. */
const NOT_A_VALUE = new Set([
	'type',
	'id',
	'unit',
	'Element1ID',
	'Element1Type',
	'Element2ID',
	'Element2Type'
]);

/** The lists of a relation whose entries are values on their own (see relationValues). */
const RELATION_VALUE_LISTS = new Set([
	'symmetric_value_to_modify',
	'element1_element2_value_to_modify',
	'element2_element1_value_to_modify'
]);

/**
 * A value of an element: its name, its content and whether it has an originality and an impact of its own (only
 * the entries of the lists of a fact do; the ones of a relation are the relation's).
 */
type ElementValue = {
	value_name: ProofData['value_name'];
	value: ProofValue;
	scored: boolean;
	/** A value of a relation: its proofs give no value, only its parameters (veracity, uncertainty, impact, originality). */
	valueless?: boolean;
};

/** The name of a value of a relation (see relationValueName): its proofs have no value, only parameters. */
const RELATION_VALUE_NAME = /^(symmetric|element1_element2|element2_element1)_value_to_modify: /;
function isRelationValueName(name: unknown): boolean {
	return valueNames(name).some((candidate) => RELATION_VALUE_NAME.test(candidate));
}

/**
 * Every value of a freshly created element (its name, description, list items and "other" values), each of which
 * gets its own founding proof. Values that are neither a text, a number, a boolean nor an evolution (rankings...) are skipped.
 */
function elementValues(
	element: Record<string, unknown>
): ElementValue[] {
	const values: ElementValue[] = [];
	const add = (value_name: ProofData['value_name'], raw: unknown, scored = true, valueless = false) => {
		const value = toProofValue(raw);
		if (value_name && value !== undefined) values.push({ value_name, value, scored, valueless });
	};

	// Each value to modify of a relation has its own proof. The proof gives no value: only the four
	// parameters of the value (veracity, uncertainty, impact, originality).
	if (element.type === 'relation') {
		for (const value of relationValues(element as Partial<RelationData>)) {
			add(value.name, value.value, true, true);
		}
	}

	for (const [key, raw] of Object.entries(element)) {
		if (NOT_A_VALUE.has(key) || RELATION_VALUE_LISTS.has(key) || raw === null || raw === undefined) continue;
		if (key === 'evolution' && Array.isArray(raw) && typeof element.unit === 'string') {
			// An evolution element holds its functions and its unit side by side: they form one value.
			add(key, { evolution: raw, unit: element.unit }, false);
		} else if (key === 'other') {
			if (Array.isArray(raw)) for (const item of raw) add(item?.name, item?.value);
		} else if (
			key === 'power' ||
			key === 'willing' ||
			key === 'material_resource_used' ||
			key === 'material_resource_necessary'
		) {
			// A titled item is a value named by its title, whose content is its description.
			if (Array.isArray(raw)) for (const item of raw) add(item?.name, item?.description);
		} else if (key === 'rankings') {
			// A ranked entry is a value named by the entity, whose content is its evolution.
			if (Array.isArray(raw)) for (const item of raw) add(item?.name, item?.value);
		} else if (Array.isArray(raw)) {
			for (const item of raw) add(key, item);
		} else {
			add(key, raw, false);
		}
	}
	return values;
}

/**
 * Whether the named value has an originality and an impact of its own: an entry of a list of a fact (an "other"
 * value, a titled item, a ranked entry), not a primary property nor a value of a relation.
 */
function hasValueScores(target: ProofTarget, name: unknown, element: Record<string, unknown>): boolean {
	// A value of a relation has its own impact and originality, voted by its proofs.
	if (!('factId' in target)) return isRelationValueName(name);
	const key = valueNames(name).find((candidate) => candidate in element);
	return key ? Array.isArray(element[key]) && key !== 'evolution' : findListEntry(name, element) !== undefined;
}

/** The parts of a value that its proofs give: its originality and impact only when it has its own. */
function valueEditFields(scored: boolean, evolution = false, valueless = false): string[] {
	const fields: string[] = VALUE_EDIT_FIELDS.filter(
		(field) => (scored || (field !== 'impact' && field !== 'originality')) && !(valueless && field === 'value')
	);
	// An evolution is edited part by part and has no general uncertainty.
	return evolution
		? fields.filter((field) => field !== 'uncertainty').flatMap((field) => (field === 'value' ? [...EVOLUTION_PARTS] : [field]))
		: fields;
}

type Evolution = { evolution: EvolutionComponent[]; unit: string };


export class ProofServer extends BaseSimulationObject<ProofData> {
	protected schema = ProofSchema;
	protected typeName = 'proof';
	protected tableName = 'proofs';

	/** Free prompt: the generator first picks the fact the proof is about, like a relation picks its endpoints. */
	protected override async generate(
		model_name: string,
		level_of_reasoning: string,
		prompt: string
	): Promise<ProofData> {
		const result = await db.query(`
			SELECT id, type, (name).fr AS name_fr, (name).en AS name_en
			FROM facts
		`);
		if (result.rows.length === 0) {
			throw new Error('At least one simulation element is required to create a proof');
		}

		const { FactID } = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nSelect the existing simulation element that this proof is about. Use its exact ID:\n${JSON.stringify(
				result.rows.map((row) => ({
					id: row.id,
					type: row.type,
					name: { fr: row.name_fr, en: row.name_en }
				}))
			)}`,
			z.object({ FactID: z.uuid() })
		);
		if (!result.rows.some((row) => row.id === FactID)) {
			throw new Error('The proof generator selected an unknown element');
		}

		return this.generateForTarget(model_name, level_of_reasoning, prompt, { factId: FactID });
	}

	/** Debate: creates a sub-proof of an existing proof (the element and the value are the ones of the parent). */
	async createSubProof(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		parentProofId: string
	): Promise<ProofData> {
		const parent = await db.query(
			`SELECT fact_id, relation_id, value_name, original_proof_id FROM proofs WHERE id = $1`,
			[parentProofId]
		);
		if (parent.rows[0]?.original_proof_id) {
			throw new Error('The original proof is a copy of the debated proof: it cannot be debated');
		}
		const target: ProofTarget | undefined = parent.rows[0]?.fact_id
			? { factId: parent.rows[0].fact_id }
			: parent.rows[0]?.relation_id
				? { relationId: parent.rows[0].relation_id }
				: undefined;
		if (!target) {
			throw new Error('The debated proof does not exist or is not linked to an element');
		}

		const data = await this.generateForTarget(model_name, level_of_reasoning, prompt, target, {
			parentProofId,
			valueName: parent.rows[0].value_name ?? undefined
		});
		await this.copyOriginalProof(parentProofId);
		await this.insert_in_db(data);
		return data;
	}

	/**
	 * When the debate of a proof starts, a copy of it becomes its first sub-proof (the original proof), so that it
	 * stands among the sub-proofs that support, question or refute it. Done only once per proof.
	 */
	private async copyOriginalProof(proofId: string): Promise<void> {
		await db.query(
			`INSERT INTO proofs (
				id, name, description, value_name, desired_value, verification_method, falsifiability_method,
				source, veracity, uncertainty, impact, originality, fact_id, relation_id, parent_proof_id,
				original_proof_id
			)
			SELECT $2, name, description, value_name, desired_value, verification_method, falsifiability_method,
				source, veracity, uncertainty, impact, originality, fact_id, relation_id, id, id
			FROM proofs
			WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM proofs WHERE original_proof_id = $1)`,
			[proofId, randomUUID()]
		);
	}

	/** A new top-level proof of an existing value of an element. */
	async createForValue(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		valueName: ProofData['value_name']
	): Promise<ProofData> {
		const data = await this.generateForTarget(model_name, level_of_reasoning, prompt, target, {
			valueName
		});
		await this.insert_in_db(data);
		return data;
	}

	/**
	 * Founding proofs of a freshly created fact or relation: one per value of the element, each generated on its own
	 * so that every value has its own sources, veracity, uncertainty and originality.
	 */
	async createInitialProof(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		element: Record<string, unknown> = {}
	): Promise<ProofData[]> {
		const context = await this.targetContext(target);
		const proofs: ProofData[] = [];

		const values = elementValues(element);
		const existing = values.length > 0 ? await this.get_all() : [];
		const targetId = 'factId' in target ? target.factId : target.relationId;
		for (let i = 0; i < values.length; i += FOUNDING_PROOF_CONCURRENCY) {
			const batch = values.slice(i, i + FOUNDING_PROOF_CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map(async (value) => {
					const evolution = valueKind(value.value) === 'evolution';
					const columns = scoreColumns(evolution, value.scored);
					const generated = (await this.generateWithSchema(
						model_name,
						level_of_reasoning,
						`${prompt}${context.text}

Create the founding proof of ONE value of this element: the value ${JSON.stringify(value.value_name)}, whose content is ${JSON.stringify(value.value)}. Give the source and the information this value is based on (documents, data, statements, observations). The sources must be real and verifiable. The founding proof adds this value: its desired value gives the ${Object.keys(columns).join(', ')} of THIS value alone over time, not of the whole element: they differ from one value to another, and from one period to another (a well documented period is more certain than a forecast). This proof will be the starting point of the debate about this value.`,
						foundingSchema(value.scored, evolution)
					)) as z.infer<ReturnType<typeof foundingSchema>> & { scores: CurvesInput; desired_value: CurvesInput };
					const { scores, desired_value: curves, ...texts } = generated;
					const own = ownScores(scores);
					// The originality of the proof: compared with the other proofs of this value.
					const sameValue = (proof: ProofData) =>
						valueNames(proof.value_name).some((name) => valueNames(value.value_name).includes(name));
					own.originality = String(
						await this.scoreOriginality(
							model_name,
							level_of_reasoning,
							'proof',
							{ ...proofSummary(texts), value_name: value.value_name, changes: { value: value.value } },
							existing
								.filter((proof) => !proof.parent_proof_id && (proof.fact_id ?? proof.relation_id) === targetId && sameValue(proof))
								.map(proofSummary)
						)
					);
					// The originality of the value itself (only for a value that has one).
					const valueOriginality = value.scored
						? await this.valueOriginality(model_name, level_of_reasoning, target, value, element, context.element)
						: undefined;
					const proof: ProofData = {
						...texts,
						...own,
						value_name: value.value_name,
						// An evolution has no general uncertainty of its own: it keeps the one of the proof, which is not used.
						desired_value: {
							...(value.valueless ? {} : { value: value.value }),
							uncertainty: own.uncertainty,
							...(valueOriginality !== undefined ? { originality: String(valueOriginality) } : {}),
							...Object.fromEntries(
								Object.entries(columns).map(([key, column]) => [key, curveExpression(curves, key, column)])
							)
						} as ValueEdit,
						// The founding proof adds the value: it gives every part of it.
						edited_fields: valueEditFields(value.scored, evolution, value.valueless),
						id: randomUUID(),
						fact_id: 'factId' in target ? target.factId : null,
						relation_id: 'relationId' in target ? target.relationId : null,
						parent_proof_id: null
					};
					await this.insert_in_db(proof);
					return proof;
				})
			);
			for (const result of results) {
				if (result.status === 'fulfilled') proofs.push(result.value);
				else console.error('Could not create a founding proof:', result.reason);
			}
		}
		return proofs;
	}

	/**
	 * The originality of a value that has one: for a value of a relation, compared with the other relations that edit the
	 * same value (see RelationServer.scoreValueOriginality); for an entry of a list of an element, compared with the other
	 * entries of the element.
	 */
	private async valueOriginality(
		model_name: string,
		level_of_reasoning: string,
		target: ProofTarget,
		value: ElementValue,
		created: Record<string, unknown>,
		stored: Record<string, unknown>
	): Promise<number> {
		const sameName = (name: unknown) => valueNames(name).some((candidate) => valueNames(value.value_name).includes(candidate));
		if ('relationId' in target) {
			for (const field of RELATION_LIST_FIELDS) {
				const direction = field.replace('_value_to_modify', '') as 'symmetric' | 'element1_element2' | 'element2_element1';
				const entries = (Array.isArray(created[field]) ? created[field] : []) as RelationData['symmetric_value_to_modify'];
				const entry = entries.find((connexion) => sameName(relationValueName(direction, connexion)));
				if (entry) {
					return RelationServer.instance.scoreValueOriginality(
						model_name,
						level_of_reasoning,
						target.relationId,
						field,
						entry
					);
				}
			}
			return 50;
		}
		const others = elementValues(stored).filter((other) => other.scored && !sameName(other.value_name));
		return this.scoreOriginality(
			model_name,
			level_of_reasoning,
			'value of an element',
			{ name: value.value_name, value: value.value },
			others.map((other) => ({ name: other.value_name, value: other.value }))
		);
	}

	/** A proof is scored by comparing it with the other proofs (see generateForTarget), never as an element. */
	protected override async elementOriginality(): Promise<number | undefined> {
		return undefined;
	}

	/**
	 * Gives a founding proof to every material resource of the existing actions that has none yet (the actions created
	 * before the materials had their own title), so that each of them shows its veracity, uncertainty and originality.
	 */
	async backfillMaterialProofs(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low'
	): Promise<{ actions: number; proofs: number }> {
		const actions = await db.query(
			`SELECT id, to_jsonb(material_resource_used) AS material_resource_used,
				to_jsonb(material_resource_necessary) AS material_resource_necessary
			FROM actions`
		);
		let updated = 0;
		let created = 0;

		for (const action of actions.rows) {
			const existing = await db.query(`SELECT value_name FROM proofs WHERE fact_id = $1`, [action.id]);
			const covered = new Set(existing.rows.flatMap((row) => valueNames(row.value_name)));
			const missing = (entries: unknown) =>
				(Array.isArray(entries) ? entries : []).filter(
					(entry) => !valueNames(entry?.name).some((name) => covered.has(name))
				);

			const material_resource_used = missing(action.material_resource_used);
			const material_resource_necessary = missing(action.material_resource_necessary);
			if (material_resource_used.length + material_resource_necessary.length === 0) continue;

			const proofs = await this.createInitialProof(
				model_name,
				level_of_reasoning,
				'Give the founding proof of the material resources of this action.',
				{ factId: action.id },
				{ material_resource_used, material_resource_necessary }
			);
			updated++;
			created += proofs.length;
		}
		return { actions: updated, proofs: created };
	}

	/**
	 * The element of the proof, as JSON for the prompt and as a record to check the value of the proof, with every
	 * value as decided by its proofs (already resolved).
	 */
	private async targetContext(
		target: ProofTarget,
		proofs: ProofData[] = [],
		year: number = dateToYear(Date.now())
	): Promise<{ text: string; element: Record<string, unknown> }> {
		if ('factId' in target) {
			// The facts table only holds the columns common to every fact: the values of a person, an action... are in
			// the tables of its type (characters, persons...), whose rows share its id. They are merged into one element.
			const fact = await db.query(
				`SELECT to_jsonb(facts) ${FACT_TYPE_TABLES.map(
					(table) => `|| COALESCE((SELECT to_jsonb(${table}) FROM ${table} WHERE ${table}.id = facts.id), '{}'::jsonb)`
				).join(' ')} AS element
				FROM facts WHERE id = $1`,
				[target.factId]
			);
			if (fact.rows.length === 0) throw new Error('The debated element does not exist');
			const element = resolveElement(fact.rows[0].element as Record<string, unknown>, proofs, year);
			return {
				element,
				text: `

This proof is about the following simulation element (its "name", "description" and "other" values are translated in every language; its "existence" and its other evolutions are functions of the time t):
${JSON.stringify(element)}`
			};
		}

		const relation = await db.query(
			`SELECT to_jsonb(r) AS element,
				(e1.name).fr AS element1_name_fr, (e1.name).en AS element1_name_en,
				(e2.name).fr AS element2_name_fr, (e2.name).en AS element2_name_en
			FROM relations r
			JOIN facts e1 ON e1.id = r.element1_id
			JOIN facts e2 ON e2.id = r.element2_id
			WHERE r.id = $1`,
			[target.relationId]
		);
		if (relation.rows.length === 0) throw new Error('The debated relation does not exist');
		const { element: raw, ...endpoints } = relation.rows[0];
		const element = resolveElement(raw as Record<string, unknown>, proofs, year);
		// Each value to modify is a value of the relation: exposed like the "other" values of a fact.
		const relationData = (await RelationServer.get_all()).find((item) => item.id === target.relationId);
		const stored = relationData ? resolveElement(relationData, proofs, year) : undefined;
		const values = stored
			? relationValues(stored).map(({ name, value }) => ({ name, value }))
			: [];
		return {
			element: { ...element, other: values },
			text: `

This proof is about the following relation between two simulation elements. Its values are its name, its description and each value to modify (a parameter-only value: a proof about it gives its veracity, uncertainty, impact and originality, never a value), named in "values":
${JSON.stringify({ ...element, ...endpoints, values })}`
		};
	}

	/**
	 * The current state of a value of the element: its content in the (resolved) element, and its scores as voted by
	 * its top-level proofs (the ones of the new proof itself when the value has none yet).
	 */
	private currentValue(
		target: ProofTarget,
		valueName: ProofData['value_name'],
		element: Record<string, unknown>,
		proofs: ProofData[],
		fallback: Pick<ProofData, 'veracity' | 'uncertainty' | 'impact' | 'originality'>,
		valueless = false
	): ValueEdit {
		const scored = hasValueScores(target, valueName, element);
		const targetId = 'factId' in target ? target.factId : target.relationId;
		const names = valueNames(valueName).map((name) => name.toLowerCase());
		const own = proofs.filter(
			(proof) =>
				!proof.parent_proof_id &&
				(proof.fact_id ?? proof.relation_id) === targetId &&
				valueNames(proof.value_name).some((name) => names.includes(name.toLowerCase()))
		);
		const voted = resolveValueFunctions(own);
		const raw = rawValue(valueName, element);
		const current = {
			// A value of a relation has no value to edit, only parameters.
			...(valueless ? {} : { value: toProofValue(raw) ?? (raw as ProofValue) }),
			veracity: voted.veracity ?? fallback.veracity,
			uncertainty: voted.uncertainty ?? fallback.uncertainty
		};
		return (
			scored
				? {
						...current,
						impact: voted.impact ?? fallback.impact,
						originality: voted.originality ?? fallback.originality
					}
				: current
		) as ValueEdit;
	}

	private async generateForTarget(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		{ parentProofId, valueName }: { parentProofId?: string; valueName?: ProofData['value_name'] } = {}
	): Promise<ProofData> {
		// Every proof as it stands after its debate: the genie sees the values as they are now.
		const year = dateToYear(Date.now());
		const proofs = await ProofServer.get_all_resolved(year);
		const { text, element } = await this.targetContext(target, proofs, year);
		let context = text;

		let parentEdit: ProofEdit | undefined;
		if (parentProofId) {
			const parent = proofs.find((proof) => proof.id === parentProofId);
			if (!parent) throw new Error('The debated proof does not exist');
			parentEdit = proofFields(parent);
			context += `\n\nThis proof is a sub-proof: it debates (supports, questions or refutes) the following existing proof:\n${JSON.stringify(
				{ ...parentEdit, value_name: parent.value_name, desired_value: parent.desired_value }
			)}\n\nThe current scores of the debated proof over time, each given by its interpolation points [date, score] and its expressions before the first and after the last point:\n${describeCurves(currentCurves(parentEdit))}`;
		}

		// Only an entry of a list of a fact has an originality and an impact of its own. When the value is not known
		// yet (free prompt), the genie may give them, and they are left out below if the value has none.
		const scored = valueName === undefined || hasValueScores(target, valueName, element);
		// A value of a relation has no value to propose: a proof about it only gives its parameters.
		const valueless = valueName !== undefined && !('factId' in target) && isRelationValueName(valueName);
		let shape: ValueShape = 'any';
		if (valueName !== undefined) {
			context += `\n\nThis proof is about the value ${JSON.stringify(valueName)} of the element: use exactly this value_name.`;
			shape = valueKind(toProofValue(rawValue(valueName, element))) === 'evolution' ? 'evolution' : 'other';
			if (!parentProofId) {
				const preview = this.currentValue(target, valueName, element, proofs, DEFAULT_SCORES, valueless);
				context += `\n\nThe current curves of this value over time, each given by its interpolation points [date, value] and its expressions before the first and after the last point (or by its expression when it mixes several proofs):\n${describeCurves(currentCurves(preview))}`;
			}
		}
		const basePrompt = `${prompt}${context}

${
			parentProofId
				? 'A sub-proof debates the proof above: in its desired_value, give ONLY the fields of the debated proof that the request asks to change (name, description, verification method, falsifiability method, sources) and null for every other field: they keep their current value exactly. The scores of the debated proof (veracity, uncertainty, impact) are curves of the time: change them in "scores" with the interpolation points of the period the request is about, and a number only for the scores it changes. Never give an originality: it is decided afterwards by comparing this sub-proof with the other sub-proofs. Never rewrite what does not need to change. It cannot edit the desired value of the debated proof.'
				: `A proof is about ONE value of the element: value_name is this existing value. In its desired_value, give ONLY what the request asks to change: ${
						valueless
							? 'NO content (the values of a relation have no value to propose: a proof about one only gives its parameters, that is its veracity, uncertainty, impact and originality) and, in "curves",'
							: 'its content (null to keep it) and, in "curves",'
					} the interpolation points of the period it is about, with a number only for the curves it changes (${
						shape === 'evolution'
							? 'the value of the evolution, its uncertainty above, its uncertainty below'
							: shape === 'other'
								? 'the scores of the value'
								: 'the value of an evolution and its uncertainty above and below, or the scores of the value'
					}) and null for the others. Everything else keeps its current value exactly: a proof about the uncertainty above in the 1990s gives points in the 1990s with only "uncertainty_above".`
		}`;

		// The value must exist and the desired content must keep its type: retry once with the error.
		const schema = parentProofId ? GeneratedSubProofSchema : generatedProofSchema(shape, scored, valueless);
		const generate = async (extra = '') => {
			const proof = (await this.generateWithSchema(model_name, level_of_reasoning, basePrompt + extra, schema)) as
				| GeneratedProof
				| GeneratedSubProof;
			return valueName !== undefined ? { ...proof, value_name: valueName } : proof;
		};
		const checked = (proof: GeneratedProof | GeneratedSubProof) => ({
			value_name: proof.value_name,
			desired_value: { value: parentProofId ? undefined : (proof as GeneratedProof).desired_value.content }
		});
		let generated = await generate();
		const error = findDesiredValueError(checked(generated), element);
		if (error) {
			generated = await generate(`\n\nYour previous answer was rejected: ${error}`);
			const secondError = findDesiredValueError(checked(generated), element);
			if (secondError) throw new Error(secondError);
		}

		const { scores, desired_value: proposed, ...texts } = generated;
		const own = ownScores(scores);
		// The originality is a single number: the genie compares this proof with the other proofs of the value, or this
		// sub-proof with the other sub-proofs of the debated proof (or sub-proof).
		const targetId = 'factId' in target ? target.factId : target.relationId;
		const sameValue = (proof: ProofData) =>
			valueNames(proof.value_name).some((name) => valueNames(generated.value_name).includes(name));
		const siblings = proofs.filter((proof) =>
			parentProofId
				? proof.parent_proof_id === parentProofId
				: !proof.parent_proof_id && (proof.fact_id ?? proof.relation_id) === targetId && sameValue(proof)
		);
		own.originality = String(
			await this.scoreOriginality(
				model_name,
				level_of_reasoning,
				parentProofId ? 'sub-proof' : 'proof',
				{ ...proofSummary(texts), value_name: generated.value_name, changes: proposedChanges(proposed) },
				siblings.map(proofSummary)
			)
		);
		let desired_value: ProofData['desired_value'];
		const edited_fields: string[] = [];
		let edited_ranges: EditedRanges = {};

		if (parentEdit) {
			// The fields left null keep their current value: the desired value is always complete.
			const edit = proposed as GeneratedSubProof['desired_value'];
			const desired: Record<string, unknown> = { ...parentEdit };
			for (const field of TEXT_EDIT_FIELDS) {
				if (edit[field] === null || edit[field] === undefined) continue;
				desired[field] = edit[field];
				edited_fields.push(field);
			}
			const curves = applyCurves(edit.scores, CURVE_SCORE_COLUMNS, currentCurves(parentEdit));
			for (const field of SCORE_FIELDS) desired[field] = curves.functions[field];
			edited_fields.push(...curves.fields);
			edited_ranges = curves.ranges;
			desired_value = desired as ProofEdit;
		} else {
			const edit = proposed as GeneratedProof['desired_value'];
			const kept = this.currentValue(target, generated.value_name, element, proofs, own, valueless);
			const evolution = valueKind(kept.value) === 'evolution';
			const curves = applyCurves(
				edit.curves,
				valueColumns(evolution, hasValueScores(target, generated.value_name, element)),
				currentCurves(kept)
			);
			const desired: Record<string, unknown> = { ...kept };
			if (evolution) {
				// An evolution is edited curve by curve (its function, its uncertainty above and below) and has no
				// general uncertainty: only the curves the proof really changed vote.
				const { functions } = curves;
				desired.value = {
					evolution: [
						{
							function: functions.value,
							weight: 1,
							uncertainty_down: functions.uncertainty_below,
							uncertainty_up: functions.uncertainty_above
						}
					],
					unit: edit.unit || (kept.value as Evolution).unit
				};
			} else if (edit.content !== null && edit.content !== undefined) {
				desired.value = edit.content;
				edited_fields.push('value');
			}
			for (const field of SCORE_FIELDS) {
				if (field in kept) desired[field] = curves.functions[field];
			}
			edited_fields.push(...curves.fields);
			edited_ranges = curves.ranges;
			desired_value = desired as ValueEdit;
		}

		return {
			...texts,
			...own,
			type: 'proof',
			desired_value,
			// Only the fields the proof really changed vote for a change, and only the period it changes stands out.
			edited_fields,
			edited_ranges,
			id: randomUUID(),
			fact_id: 'factId' in target ? target.factId : null,
			relation_id: 'relationId' in target ? target.relationId : null,
			parent_proof_id: parentProofId ?? null
		};
	}

	async insert_in_db(proof: ProofData): Promise<void> {
		await db.query(
			`INSERT INTO proofs (
				id,
				name,
				description,
				value_name,
				desired_value,
				verification_method,
				falsifiability_method,
				source,
				veracity,
				uncertainty,
				impact,
				originality,
				fact_id,
				relation_id,
				parent_proof_id,
				edited_fields,
				edited_ranges
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
			[
				proof.id ?? randomUUID(),
				convertToPg(proof.name),
				convertToPg(proof.description),
				JSON.stringify(proof.value_name),
				JSON.stringify(proof.desired_value),
				convertToPg(proof.verification_method),
				convertToPg(proof.falsifiability_method),
				convertToPg(proof.source || []),
				proof.veracity,
				proof.uncertainty,
				proof.impact,
				proof.originality,
				proof.fact_id ?? null,
				proof.relation_id ?? null,
				proof.parent_proof_id ?? null,
				proof.edited_fields ?? null,
				proof.edited_ranges ? JSON.stringify(proof.edited_ranges) : null
			]
		);
	}

	async get_all(): Promise<ProofData[]> {
		const result = await db.query(`
			SELECT *
			FROM proofs
			WHERE value_name IS NOT NULL
			ORDER BY created_at DESC
		`);

		const proofs: ProofData[] = result.rows.map((row) => ({
			id: row.id,
			type: 'proof' as const,
			name: row.name,
			description: row.description,
			value_name: row.value_name,
			desired_value: row.desired_value,
			verification_method: row.verification_method,
			falsifiability_method: row.falsifiability_method,
			source: row.source || [],
			veracity: toScoreFunction(row.veracity),
			uncertainty: toScoreFunction(row.uncertainty),
			impact: toScoreFunction(row.impact),
			originality: toScoreFunction(row.originality),
			fact_id: row.fact_id,
			relation_id: row.relation_id,
			parent_proof_id: row.parent_proof_id,
			original_proof_id: row.original_proof_id ?? null,
			edited_fields: row.edited_fields ?? null,
			edited_ranges: row.edited_ranges ?? null
		}));

		// The fields a desired value kept: the scores of the proof itself, or the fields of the debated proof.
		const byId = new Map(proofs.map((proof) => [proof.id, proof]));
		// The debated proof before its debate: its original proof copy.
		const before = new Map(
			proofs.filter((proof) => proof.original_proof_id).map((copy) => [copy.original_proof_id, copy])
		);
		const scoresOf = ({ veracity, uncertainty, impact, originality }: ProofData) => ({
			veracity,
			uncertainty,
			impact,
			originality
		});
		return proofs.map((proof) => {
			const parent = proof.parent_proof_id ? byId.get(proof.parent_proof_id) : undefined;
			// The original proof is a copy of the debated proof: its desired value is the one of a top-level proof.
			const kept: ValueEdit | ProofEdit =
				parent && !proof.original_proof_id
					? {
							name: parent.name,
							description: parent.description,
							verification_method: parent.verification_method,
							falsifiability_method: parent.falsifiability_method,
							source: parent.source,
							...scoresOf(parent)
						}
					: ({ value: null, ...scoresOf(proof) } as unknown as ValueEdit);
			const stored = proof.desired_value as unknown;
			// A value without an originality and an impact of its own: its desired value gives neither.
			if (
				'value' in kept &&
				typeof stored === 'object' &&
				stored !== null &&
				'veracity' in stored &&
				!('impact' in stored)
			) {
				delete (kept as Record<string, unknown>).impact;
				delete (kept as Record<string, unknown>).originality;
			}
			const complete = { ...proof, desired_value: toDesiredValue(stored, kept) };
			if (complete.edited_fields) return complete;

			// Saved before the changed fields were stored: the ones it gave (when it left the others null), else guessed.
			const leftNull =
				typeof stored === 'object' && stored !== null && Object.values(stored).some((value) => value === null);
			const edited_fields =
				leftNull && !proof.original_proof_id
					? changedFields(stored as object)
					: legacyEditedFields(
							complete,
							proof.parent_proof_id ? (before.get(proof.parent_proof_id) ?? parent) : undefined
						);
			return { ...complete, edited_fields };
		});
	}

	/** Every proof as it stands after its debate at the moment year (see resolveProofs). */
	static async get_all_resolved(year: number): Promise<ProofData[]> {
		return resolveProofs(await ProofServer.instance.get_all(), year);
	}

	/**
	 * The proofs without the originality and the impact they desire for a value that has none of its own (a primary
	 * property or a value of a relation): proofs saved before this rule gave them to every value.
	 */
	static withoutUnusedValueScores(proofs: ProofData[], elements: object[]): ProofData[] {
		const byId = new Map(
			elements.map((element) => [(element as { id?: unknown }).id, element as Record<string, unknown>])
		);
		return proofs.map((proof) => {
			if (proof.parent_proof_id) return proof;
			const target: ProofTarget = proof.fact_id ? { factId: proof.fact_id } : { relationId: proof.relation_id ?? '' };
			const element = byId.get(proof.fact_id ?? proof.relation_id);
			if (!element || hasValueScores(target, proof.value_name, element)) return proof;
			const { impact: _impact, originality: _originality, ...desired_value } = proof.desired_value as Record<
				string,
				unknown
			>;
			return {
				...proof,
				desired_value: desired_value as ProofData['desired_value'],
				edited_fields: proof.edited_fields?.filter((field) => field !== 'impact' && field !== 'originality')
			};
		});
	}

	static instance = new ProofServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<ProofData> {
		return ProofServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async createSubProof(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string,
		parentProofId: string
	): Promise<ProofData> {
		return ProofServer.instance.createSubProof(
			model_name,
			level_of_reasoning,
			prompt,
			parentProofId
		);
	}

	static async createForValue(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string,
		target: ProofTarget,
		valueName: ProofData['value_name']
	): Promise<ProofData> {
		return ProofServer.instance.createForValue(model_name, level_of_reasoning, prompt, target, valueName);
	}

	static async get_all(): Promise<ProofData[]> {
		return ProofServer.instance.get_all();
	}
}

export const Proof = ProofServer;
