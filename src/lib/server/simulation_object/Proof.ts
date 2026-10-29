import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BaseSimulationObject } from './BaseSimulationObject';
import {
	ProofSchema,
	SubProofSchema,
	ProofEditSchema,
	ValueEditSchema,
	PlainValueEditSchema,
	ValueScoresSchema,
	valueKind,
	type ProofData,
	type ProofEdit,
	type ValueEdit
} from '$lib/simulation/Proof';
import {
	PROOF_EDIT_FIELDS,
	VALUE_EDIT_FIELDS,
	VALUE_LISTS,
	resolveElement,
	resolveProofs,
	resolveValue,
	valueNames
} from '$lib/simulation/ProofResolution';
import { relationValues, type RelationData } from '$lib/simulation/Relation';
import { RelationServer } from './Relation';
import { convertToPg } from './Genie';
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

/**
 * The content of a founding proof: the value itself is added afterwards, the proof gives the scores it adds with it.
 */
const FoundingProofSchema = ProofSchema.omit({ value_name: true, desired_value: true }).extend({
	desired_value: ValueScoresSchema.describe('The scores this founding proof adds to its value.')
});

/** The founding proof of a value without an originality and an impact of its own (see hasValueScores). */
const PlainFoundingProofSchema = FoundingProofSchema.extend({
	desired_value: ValueScoresSchema.omit({ impact: true, originality: true }).describe(
		'The scores this founding proof adds to its value.'
	)
});

/** The same edit with every field nullable: the genie gives only what it changes, null for what it keeps. */
function keepable<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
	return z.object(
		Object.fromEntries(
			Object.entries(schema.shape).map(([key, field]) => {
				const type = field as z.ZodType;
				return [key, type.nullable().describe(`${type.description ?? ''} Null to keep the current one unchanged.`)];
			})
		)
	) as unknown as z.ZodObject<{ [Key in keyof Shape]: z.ZodNullable<Shape[Key]> }>;
}

/** A top-level proof as generated: its desired value gives only the parts of the value it changes. */
const GeneratedProofSchema = ProofSchema.extend({
	desired_value: keepable(ValueEditSchema).describe(
		'Only the parts of the value this proof changes (its content and its scores); null for every part it keeps.'
	)
});

/** A top-level proof of a value without an originality and an impact of its own (see hasValueScores). */
const GeneratedPlainProofSchema = ProofSchema.extend({
	desired_value: keepable(PlainValueEditSchema).describe(
		'Only the parts of the value this proof changes (its content, veracity and uncertainty); null for every part it keeps.'
	)
});

/** A sub-proof as generated: its desired value gives only the fields of the debated proof it changes. */
const GeneratedSubProofSchema = SubProofSchema.extend({
	desired_value: keepable(ProofEditSchema).describe(
		'Only the fields of the debated proof this sub-proof changes (never its desired value); null for every field it keeps.'
	)
});

type ProofValue = NonNullable<ValueEdit['value']>;

/** Values saved as a plain string (before texts had to be translated) are repeated in every language. */
function toProofValue(value: unknown): ProofValue | undefined {
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return { fr: value, en: value, de: value, es: value };
	return valueKind(value) ? (value as ProofValue) : undefined;
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
	return { ...kept, ...given } as ProofData['desired_value'];
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
	'element1_element2_value_to_modify',
	'element1_element2_new_value',
	'element2_element1_value_to_modify',
	'element2_element1_new_value'
]);

/**
 * A value of an element: its name, its content and whether it has an originality and an impact of its own (only
 * the entries of the lists of a fact do; the ones of a relation are the relation's).
 */
type ElementValue = { value_name: ProofData['value_name']; value: ProofValue; scored: boolean };

/**
 * Every value of a freshly created element (its name, description, list items and "other" values), each of which
 * gets its own founding proof. Values that are neither a text, a number, a boolean nor an evolution (rankings...) are skipped.
 */
function elementValues(
	element: Record<string, unknown>
): ElementValue[] {
	const values: ElementValue[] = [];
	const add = (value_name: ProofData['value_name'], raw: unknown, scored = true) => {
		const value = toProofValue(raw);
		if (value_name && value !== undefined) values.push({ value_name, value, scored });
	};

	// Each value to modify and each value to add of a relation has its own proof.
	if (element.type === 'relation') {
		for (const value of relationValues(element as Partial<RelationData>)) {
			add(value.name, value.value, false);
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
	if (!('factId' in target)) return false;
	const key = valueNames(name).find((candidate) => candidate in element);
	return key ? Array.isArray(element[key]) && key !== 'evolution' : findListEntry(name, element) !== undefined;
}

/** The parts of a value that its proofs give: its originality and impact only when it has its own. */
function valueEditFields(scored: boolean): string[] {
	return VALUE_EDIT_FIELDS.filter((field) => scored || (field !== 'impact' && field !== 'originality'));
}

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
		for (let i = 0; i < values.length; i += FOUNDING_PROOF_CONCURRENCY) {
			const batch = values.slice(i, i + FOUNDING_PROOF_CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map(async (value) => {
					const generated = await this.generateWithSchema(
						model_name,
						level_of_reasoning,
						`${prompt}${context.text}

Create the founding proof of ONE value of this element: the value ${JSON.stringify(value.value_name)}, whose content is ${JSON.stringify(value.value)}. Give the source and the information this value is based on (documents, data, statements, observations). The sources must be real and verifiable. The founding proof adds this value: its desired value gives the ${value.scored ? 'veracity, uncertainty, impact and originality' : 'veracity and uncertainty'} of THIS value alone, not of the whole element: they differ from one value to another. This proof will be the starting point of the debate about this value.`,
						value.scored ? FoundingProofSchema : PlainFoundingProofSchema
					);
					const proof: ProofData = {
						...generated,
						value_name: value.value_name,
						desired_value: { value: value.value, ...generated.desired_value },
						// The founding proof adds the value: it gives every part of it.
						edited_fields: valueEditFields(value.scored),
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
		proofs: ProofData[] = []
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
			const element = resolveElement(fact.rows[0].element as Record<string, unknown>, proofs);
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
		const element = resolveElement(raw as Record<string, unknown>, proofs);
		// Each value to modify and each value to add is a value of the relation: exposed like the "other" values of a fact.
		const relationData = (await RelationServer.get_all()).find((item) => item.id === target.relationId);
		const stored = relationData ? resolveElement(relationData, proofs) : undefined;
		const values = stored
			? relationValues(stored).map(({ name, value }) => ({ name, value }))
			: [];
		return {
			element: { ...element, other: values },
			text: `

This proof is about the following relation between two simulation elements. Its values are its name, its description and each value to modify (its value is the impact) or value to add (its value is the content), named in "values":
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
		fallback: Pick<ProofData, 'veracity' | 'uncertainty' | 'impact' | 'originality'>
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
		const voted = resolveValue(own);
		const raw = findOriginalValue(valueName, element);
		const current = {
			value: toProofValue(raw) ?? (raw as ProofValue),
			veracity: voted.veracity ?? fallback.veracity,
			uncertainty: voted.uncertainty ?? fallback.uncertainty
		};
		return scored
			? {
					...current,
					impact: voted.impact ?? fallback.impact,
					originality: voted.originality ?? fallback.originality
				}
			: current;
	}

	private async generateForTarget(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		{ parentProofId, valueName }: { parentProofId?: string; valueName?: ProofData['value_name'] } = {}
	): Promise<ProofData> {
		// Every proof as it stands after its debate: the genie sees the values as they are now.
		const proofs = await ProofServer.get_all_resolved();
		const { text, element } = await this.targetContext(target, proofs);
		let context = text;

		let parentEdit: ProofEdit | undefined;
		if (parentProofId) {
			const parent = proofs.find((proof) => proof.id === parentProofId);
			if (!parent) throw new Error('The debated proof does not exist');
			parentEdit = proofFields(parent);
			context += `\n\nThis proof is a sub-proof: it debates (supports, questions or refutes) the following existing proof:\n${JSON.stringify(
				{ ...parentEdit, value_name: parent.value_name, desired_value: parent.desired_value }
			)}`;
		}
		if (valueName !== undefined) {
			context += `\n\nThis proof is about the value ${JSON.stringify(valueName)} of the element: use exactly this value_name.`;
		}

		// Only an entry of a list of a fact has an originality and an impact of its own. When the value is not known
		// yet (free prompt), the genie may give them, and they are dropped below if the value has none.
		const scored = valueName === undefined || hasValueScores(target, valueName, element);
		const basePrompt = `${prompt}${context}

${
			parentProofId
				? 'A sub-proof debates the proof above: in its desired_value, give ONLY the fields of the debated proof that the request asks to change (name, description, verification method, falsifiability method, sources, veracity, uncertainty, impact, originality) and null for every other field: they keep their current value exactly. Never rewrite a field that does not need to change. It cannot edit the desired value of the debated proof.'
				: `A proof is about ONE value of the element: value_name is this existing value. In its desired_value, give ONLY the parts of the value that the request asks to change (its content, veracity, uncertainty${scored ? ', impact, originality' : ''}) and null for every other part: they keep their current value exactly.`
		}`;

		// The value must exist and the desired content must keep its type: retry once with the error.
		const generate = async (extra = '') => {
			const proof: z.infer<
				typeof GeneratedProofSchema | typeof GeneratedPlainProofSchema | typeof GeneratedSubProofSchema
			> = await this.generateWithSchema(
				model_name,
				level_of_reasoning,
				basePrompt + extra,
				parentProofId ? GeneratedSubProofSchema : scored ? GeneratedProofSchema : GeneratedPlainProofSchema
			);
			return valueName !== undefined ? { ...proof, value_name: valueName } : proof;
		};
		let generated = await generate();
		const error = findDesiredValueError(generated, element);
		if (error) {
			generated = await generate(`\n\nYour previous answer was rejected: ${error}`);
			const secondError = findDesiredValueError(generated, element);
			if (secondError) throw new Error(secondError);
		}
		if (!parentProofId && !hasValueScores(target, generated.value_name, element)) {
			const { impact: _impact, originality: _originality, ...plain } = generated.desired_value as Record<
				string,
				unknown
			>;
			generated = { ...generated, desired_value: plain } as typeof generated;
		}

		// The fields left null keep their current value: the desired value is always complete.
		const kept: ValueEdit | ProofEdit =
			parentEdit ?? this.currentValue(target, generated.value_name, element, proofs, generated);
		const proof = { ...generated, desired_value: toDesiredValue(generated.desired_value, kept) };

		return {
			...proof,
			// Only the fields the genie did not leave null vote for a change.
			edited_fields: changedFields(generated.desired_value),
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
				edited_fields
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
				proof.edited_fields ?? null
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
			veracity: Number(row.veracity),
			uncertainty: Number(row.uncertainty),
			impact: Number(row.impact),
			originality: Number(row.originality),
			fact_id: row.fact_id,
			relation_id: row.relation_id,
			parent_proof_id: row.parent_proof_id,
			original_proof_id: row.original_proof_id ?? null,
			edited_fields: row.edited_fields ?? null
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

	/** Every proof as it stands after its debate (see resolveProofs). */
	static async get_all_resolved(): Promise<ProofData[]> {
		return resolveProofs(await ProofServer.instance.get_all());
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
