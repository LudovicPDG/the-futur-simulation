import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BaseSimulationObject } from './BaseSimulationObject';
import {
	ProofSchema,
	SubProofSchema,
	ValueScoresSchema,
	valueKind,
	type ProofData,
	type ProofEdit,
	type ValueEdit
} from '$lib/simulation/Proof';
import { relationValues, type RelationData } from '$lib/simulation/Relation';
import { RelationServer } from './Relation';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

/** The element a proof is about: a fact (or subtype) or a relation. */
type ProofTarget = { factId: string } | { relationId: string };

/** How many founding proofs are generated at the same time. */
const FOUNDING_PROOF_CONCURRENCY = 4;

/**
 * The content of a founding proof: the value itself is added afterwards, the proof gives the scores it adds with it.
 */
const FoundingProofSchema = ProofSchema.omit({ value_name: true, desired_value: true }).extend({
	desired_value: ValueScoresSchema.describe('The scores this founding proof adds to its value.')
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

/** Every language-keyed name of a value ("description" or {fr, en, de, es}). */
function valueNames(name: unknown): string[] {
	if (typeof name === 'string') return [name];
	if (typeof name === 'object' && name !== null) {
		return Object.values(name).filter((value): value is string => typeof value === 'string');
	}
	return [];
}

/** The lists whose entries are values on their own: the "other" values, and the titled items (capabilities, willingness). */
const VALUE_LISTS = [
	['other', 'value'],
	['power', 'description'],
	['willing', 'description'],
	['material_resource_used', 'description'],
	['material_resource_necessary', 'description'],
	['rankings', 'value']
] as const;

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
	proof: Pick<ProofData, 'value_name' | 'desired_value'>,
	element: Record<string, unknown>
): string | undefined {
	const label = valueNames(proof.value_name)[0];
	if (!hasValue(proof.value_name, element)) {
		return `the value "${label}" does not exist in the element. A proof is about ONE existing value: use the exact key of a primary property or the exact name of an "other information".`;
	}
	// A sub-proof edits the debated proof, not the content of the value.
	if (!('value' in proof.desired_value)) return undefined;
	const originalKind = valueKind(findOriginalValue(proof.value_name, element));
	const desiredKind = valueKind(proof.desired_value.value);
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

/** A value of an element: its name and its content. */
type ElementValue = { value_name: ProofData['value_name']; value: ProofValue };

/**
 * Every value of a freshly created element (its name, description, list items and "other" values), each of which
 * gets its own founding proof. Values that are neither a text, a number, a boolean nor an evolution (rankings...) are skipped.
 */
function elementValues(
	element: Record<string, unknown>
): ElementValue[] {
	const values: ElementValue[] = [];
	const add = (value_name: ProofData['value_name'], raw: unknown) => {
		const value = toProofValue(raw);
		if (value_name && value !== undefined) values.push({ value_name, value });
	};

	// Each value to modify and each value to add of a relation has its own proof.
	if (element.type === 'relation') {
		for (const value of relationValues(element as Partial<RelationData>)) {
			add(value.name, value.value);
		}
	}

	for (const [key, raw] of Object.entries(element)) {
		if (NOT_A_VALUE.has(key) || RELATION_VALUE_LISTS.has(key) || raw === null || raw === undefined) continue;
		if (key === 'evolution' && Array.isArray(raw) && typeof element.unit === 'string') {
			// An evolution element holds its functions and its unit side by side: they form one value.
			add(key, { evolution: raw, unit: element.unit });
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
			add(key, raw);
		}
	}
	return values;
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

Create the founding proof of ONE value of this element: the value ${JSON.stringify(value.value_name)}, whose content is ${JSON.stringify(value.value)}. Give the source and the information this value is based on (documents, data, statements, observations). The sources must be real and verifiable. The founding proof adds this value: its desired value gives the veracity, uncertainty, impact and originality of THIS value alone, not of the whole element: they differ from one value to another. This proof will be the starting point of the debate about this value.`,
						FoundingProofSchema
					);
					const proof: ProofData = {
						...generated,
						value_name: value.value_name,
						desired_value: { value: value.value, ...generated.desired_value },
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

	/** The element of the proof, as JSON for the prompt and as a record to check the value of the proof. */
	private async targetContext(
		target: ProofTarget
	): Promise<{ text: string; element: Record<string, unknown> }> {
		if ('factId' in target) {
			const fact = await db.query(
				`SELECT to_jsonb(facts) AS element FROM facts WHERE id = $1`,
				[target.factId]
			);
			if (fact.rows.length === 0) throw new Error('The debated element does not exist');
			return {
				element: fact.rows[0].element,
				text: `

This proof is about the following simulation element (its "name", "description" and "other" values are translated in every language; its "existence" and its other evolutions are functions of the time t):
${JSON.stringify(fact.rows[0].element)}`
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
		const { element, ...endpoints } = relation.rows[0];
		// Each value to modify and each value to add is a value of the relation: exposed like the "other" values of a fact.
		const stored = (await RelationServer.get_all()).find((item) => item.id === target.relationId);
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

	private async generateForTarget(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		{ parentProofId, valueName }: { parentProofId?: string; valueName?: ProofData['value_name'] } = {}
	): Promise<ProofData> {
		const { text, element } = await this.targetContext(target);
		let context = text;

		if (parentProofId) {
			const parent = await db.query(
				`SELECT (name).fr AS name_fr, (name).en AS name_en,
					(description).fr AS description_fr, (description).en AS description_en,
					value_name, desired_value,
					(verification_method).fr AS verification_method_fr,
					(falsifiability_method).fr AS falsifiability_method_fr,
					source, veracity, uncertainty, impact, originality
				FROM proofs WHERE id = $1`,
				[parentProofId]
			);
			if (parent.rows.length === 0) throw new Error('The debated proof does not exist');
			context += `\n\nThis proof is a sub-proof: it debates (supports, questions or refutes) the following existing proof:\n${JSON.stringify(parent.rows[0])}`;
		}
		if (valueName !== undefined) {
			context += `\n\nThis proof is about the value ${JSON.stringify(valueName)} of the element: use exactly this value_name.`;
		}

		const basePrompt = `${prompt}${context}

${
			parentProofId
				? 'A sub-proof debates the proof above: its desired_value MUST give EVERY field of the debated proof (name, description, verification method, falsifiability method, sources, veracity, uncertainty, impact, originality) as the sub-proof wants it, repeating the current one for a field it keeps. It cannot edit the desired value of the debated proof. A sub-proof that supports the debated proof may raise its veracity, one that questions or refutes it lowers its veracity or corrects its other fields.'
				: 'A proof is about ONE value of the element: value_name is this existing value and desired_value MUST give EVERY part of it (its content, veracity, uncertainty, impact and originality) as the proof wants it, repeating the current content for a part it keeps.'
		}`;

		// The value must exist and the desired content must keep its type: retry once with the error.
		const generate = async (extra = '') => {
			const proof: z.infer<typeof ProofSchema | typeof SubProofSchema> = await this.generateWithSchema(
				model_name,
				level_of_reasoning,
				basePrompt + extra,
				parentProofId ? SubProofSchema : ProofSchema
			);
			return valueName !== undefined ? { ...proof, value_name: valueName } : proof;
		};
		let proof = await generate();
		const error = findDesiredValueError(proof, element);
		if (error) {
			proof = await generate(`\n\nYour previous answer was rejected: ${error}`);
			const secondError = findDesiredValueError(proof, element);
			if (secondError) throw new Error(secondError);
		}

		return {
			...proof,
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
				parent_proof_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
				proof.parent_proof_id ?? null
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
			original_proof_id: row.original_proof_id ?? null
		}));

		// The fields a desired value kept: the scores of the proof itself, or the fields of the debated proof.
		const byId = new Map(proofs.map((proof) => [proof.id, proof]));
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
			return { ...proof, desired_value: toDesiredValue(proof.desired_value, kept) };
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
