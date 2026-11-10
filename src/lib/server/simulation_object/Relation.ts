import { BaseSimulationObject } from './BaseSimulationObject';
import {
	RelationConnexionSchema,
	RelationEstimateSchema,
	RelationElementTypeSchema,
	RelationSchema,
	type RelationData
} from '$lib/simulation/Relation';
import { convertToPg } from './PgConversion';
import { db } from '../utils/database';
import { z } from 'zod';
import { RELATION_LIST_FIELDS, type RelationListField } from '$lib/simulation/Relation';

/** The kind of value a property holds: only a function (evolution), a number or a boolean can be related. */
export type PropertyKind = 'function' | 'number' | 'boolean' | 'text' | 'array';

/** Why the genie refuses a relation: it links a text or an array, or a relation is both symmetric and asymmetric. */
export class RelationRefusal extends Error {
	constructor(public code: 'not_relatable' | 'symmetry_conflict') {
		super(code);
		this.name = 'RelationRefusal';
	}
}

/** The kind of a created value: only a number or a boolean can be related, a text or a list cannot. */
function valueKind(value: unknown): PropertyKind {
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';
	if (Array.isArray(value)) return 'array';
	if (typeof value === 'object' && value !== null && 'evolution' in value) return 'function';
	return 'text';
}

const isRelatable = (kind: PropertyKind | undefined) =>
	kind === undefined || kind === 'function' || kind === 'number' || kind === 'boolean';

/** The titles of the entries of a list (other data, capabilities, willingness...): each one can be targeted by a relation. */
function getAdditionalPropertyNames(other: unknown): string[] {
	if (!Array.isArray(other)) return [];

	return other.flatMap((entry: unknown) => {
		if (typeof entry !== 'object' || entry === null || !('name' in entry)) return [];
		const name = entry.name;
		if (typeof name === 'string') return [name];
		if (typeof name === 'object' && name !== null) {
			return Object.values(name).filter((value): value is string => typeof value === 'string');
		}
		return [];
	});
}

function propertyEnum(propertyNames: string[]) {
	const values = [...new Set(propertyNames)];
	const [first, ...rest] = values;
	if (!first) throw new Error('Relation endpoints must expose at least one property');
	return z.enum([first, ...rest]);
}

function mapDatabaseConnexions(
	connexions: unknown,
	reverseDirection = false
): RelationData['element1_element2_value_to_modify'] {
	if (!Array.isArray(connexions)) {
		throw new Error('Database returned invalid relation connexion data');
	}

	return connexions.map((connexion: unknown) => {
		if (typeof connexion !== 'object' || connexion === null) {
			throw new Error('Database returned an invalid relation connexion');
		}
		const fields = connexion as Record<string, unknown>;
		return RelationConnexionSchema.parse({
			Element1Property: reverseDirection
				? (fields.element2_property ?? fields.target_property)
				: (fields.element1_property ?? fields.source_property),
			Element2Property: reverseDirection
				? (fields.element1_property ?? fields.source_property)
				: (fields.element2_property ?? fields.target_property),
			impact: fields.impact,
			estimate: fields.estimate ?? undefined
		});
	});
}

/** A connexion as the composite relation_connexion_t stores it (source, target, impact, estimate as JSON text). */
function toPgConnexion(connexion: RelationData['element1_element2_value_to_modify'][number], reversed: boolean) {
	const estimate = connexion.estimate ? JSON.stringify(connexion.estimate) : null;
	return reversed
		? {
				Element2Property: connexion.Element2Property,
				Element1Property: connexion.Element1Property,
				impact: connexion.impact,
				estimate
			}
		: {
				SourceProperty: connexion.Element1Property,
				TargetProperty: connexion.Element2Property,
				impact: connexion.impact,
				estimate
			};
}

function visibleElement<T extends { kinds: unknown }>({ kinds: _kinds, ...visible }: T) {
	return visible;
}

type Linked = { Element1Property: string; Element2Property: string; value?: unknown };
type Kinds = Record<string, PropertyKind>;

/** Throws a refusal when an entry links a text or an array (a property of an element, or a created text value). */
function assertRelatable(entries: Linked[], kinds1: Kinds, kinds2: Kinds) {
	for (const entry of entries) {
		if (
			!isRelatable(kinds1[entry.Element1Property]) ||
			!isRelatable(kinds2[entry.Element2Property]) ||
			(entry.value !== undefined && !isRelatable(valueKind(entry.value)))
		) {
			throw new RelationRefusal('not_relatable');
		}
	}
}

const pairKey = (entry: Linked) => `${entry.Element1Property}|${entry.Element2Property}`;

const asymmetricPairs = (relation: Partial<RelationData>) =>
	[
		...(relation.element1_element2_value_to_modify ?? []),
		...(relation.element2_element1_value_to_modify ?? [])
	].map(pairKey);

const symmetricPairs = (relation: Partial<RelationData>) =>
	(relation.symmetric_value_to_modify ?? []).map(pairKey);

/** The tables that hold the values of each type of fact, merged with the facts table into one element. */
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

/** Keys of an element that are not values a relation can link. */
const NOT_LINKABLE = new Set(['id', 'type', 'name', 'description', 'unit']);

/** The kind of a value as the element really holds it, or undefined when it is not a value a relation can move. */
function linkableKind(key: string, value: unknown): PropertyKind | undefined {
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';
	if (key === 'evolution' && Array.isArray(value)) return 'function';
	if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'evolution' in value && 'unit' in value) {
		return 'function';
	}
	return undefined;
}

/**
 * Every element a relation can link, with the properties it really has: only the numbers, the booleans and the
 * functions (evolutions) the element holds, and the ones of its "other" values. A relation can never link a value
 * that does not exist.
 */
async function loadElements(ids?: string[]) {
	const result = await db.query(
		`
		SELECT f.id, lower(f.type) AS type, (f.name).fr AS name_fr, (f.name).en AS name_en,
			to_jsonb(f) ${FACT_TYPE_TABLES.map(
				(table) => `|| COALESCE((SELECT to_jsonb(${table}) FROM ${table} WHERE ${table}.id = f.id), '{}'::jsonb)`
			).join(' ')} AS element,
			to_jsonb(f.other) AS other
		FROM facts f
		WHERE lower(f.type) = ANY($1::text[]) AND ($2::uuid[] IS NULL OR f.id = ANY($2::uuid[]))
	`,
		[RelationElementTypeSchema.options, ids ?? null]
	);
	return result.rows.map((row) => {
		const kinds: Record<string, PropertyKind> = {};
		for (const [key, value] of Object.entries(row.element as Record<string, unknown>)) {
			const kind = NOT_LINKABLE.has(key) ? undefined : linkableKind(key, value);
			if (kind) kinds[key] = kind;
		}
		// The "other" values are named by their title.
		for (const entry of Array.isArray(row.other) ? row.other : []) {
			const kind = linkableKind('other', entry?.value);
			if (!kind) continue;
			for (const name of getAdditionalPropertyNames([entry])) kinds[name] = kind;
		}
		return {
			id: row.id as string,
			type: row.type as string,
			name: { fr: row.name_fr, en: row.name_en },
			kinds,
			properties: Object.keys(kinds)
		};
	});
}

export class RelationServer extends BaseSimulationObject<RelationData> {
	protected schema = RelationSchema;
	protected typeName = 'relation';
	protected tableName = 'relations';
	protected override proofOwner = 'relation' as const;

	protected override async generate(
		model_name: string,
		level_of_reasoning: string,
		prompt: string
	): Promise<RelationData> {
		const elements = await loadElements();
		if (elements.length < 2) {
			throw new Error('At least two simulation elements are required to create a relation');
		}

		const endpoints = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nSelect two distinct existing simulation elements for this relation. Use their exact IDs and types. Available property names are included for each element:\n${JSON.stringify(elements)}`,
			z.object({
				Element1ID: z.uuid(),
				Element1Type: RelationElementTypeSchema,
				Element2ID: z.uuid(),
				Element2Type: RelationElementTypeSchema
			})
		);

		const element1 = elements.find((element) => element.id === endpoints.Element1ID);
		const element2 = elements.find((element) => element.id === endpoints.Element2ID);
		if (!element1 || !element2 || element1.id === element2.id) {
			throw new Error('The relation generator selected invalid or duplicate endpoints');
		}
		if (element1.type !== endpoints.Element1Type || element2.type !== endpoints.Element2Type) {
			throw new Error('The relation generator selected endpoint types that do not match their IDs');
		}

		const element1Property = propertyEnum(element1.properties);
		const element2Property = propertyEnum(element2.properties);
		const connexionSchema = z.object({
			Element1Property: element1Property,
			Element2Property: element2Property,
			impact: z.number(),
			estimate: RelationEstimateSchema
		});
		const generatedSchema = RelationSchema.extend({
			Element1ID: z.literal(element1.id),
			Element1Type: z.literal(element1.type),
			Element2ID: z.literal(element2.id),
			Element2Type: z.literal(element2.type),
			symmetric_value_to_modify: z.array(connexionSchema),
			element1_element2_value_to_modify: z.array(connexionSchema),
			element2_element1_value_to_modify: z.array(connexionSchema)
		});

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nCreate the relation between these already-selected elements. Do not change their IDs or types.\nElement 1: ${JSON.stringify(element1)}\nElement 2: ${JSON.stringify(element2)}\n\nelement1_element2_value_to_modify lists the existing values of element 2 that element 1 modifies: Element1Property is selected from element 1 properties and Element2Property from element 2 properties; impact is the strength of that property-to-property relation. For the element2_element1_* fields, reverse those choices. The symmetric_* fields have the same format as the element1_element2_* ones, but describe an effect that works identically in BOTH directions (element 1 on element 2 and element 2 on element 1): put there only what is really mutual, and put in the element1_element2_* / element2_element1_* fields only what is one-way (asymmetric). Never repeat an entry in both. ESTIMATE: for each entry, "estimate" says how the value of the source property gives an estimate of the value of the target property (the source is Element1Property for element1_element2_* and Element2Property for element2_element1_*; the symmetric_* entries are one link read in both directions). Choose the kind that fits the real mechanism: proportional (parameter = factor), additive (parameter = offset), inverse (parameter = constant), or points (at least two {source_value, estimated_value} points, for any other shape). The estimate is what the target value should be according to this relation alone, so where the two values are already consistent it must give the current target value. Use the units of the properties. A relation only links NUMBERS, FUNCTIONS (evolutions, probabilities, resources...) and BOOLEANS: never link a text or a list. An entry that links a text makes the whole relation impossible. Use numeric properties (for example the start or end probability of an event, or a financial resource).`,
			generatedSchema
		);

		assertRelatable(
			[
				...generated.symmetric_value_to_modify,
				...generated.element1_element2_value_to_modify,
				...generated.element2_element1_value_to_modify
			],
			element1.kinds,
			element2.kinds
		);
		// A relation cannot be symmetric and asymmetric at once: the symmetric one wins.
		const symmetric = new Set(symmetricPairs(generated));
		for (const key of [
			'element1_element2_value_to_modify',
			'element2_element1_value_to_modify'
		] as const) {
			generated[key] = generated[key].filter((entry) => !symmetric.has(pairKey(entry))) as never;
		}

		// `generated` is already parsed: its schema transforms the interpolation points of the existence into
		// functions, so parsing it again with RelationSchema would fail (it expects points, not functions).
		return generated as RelationData;
	}

	async insert_in_db(relation: RelationData): Promise<string> {
		const result = await db.query(
			`INSERT INTO relations (
				name,
				description,
				element1_id,
				element1_type,
				element2_id,
				element2_type,
				element1_element2_connexions,
				element2_element1_connexions,
				existence,
				originality,
				impact,
				symmetric_connexions
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
			[
				convertToPg(relation.name),
				convertToPg(relation.description),
				relation.Element1ID,
				relation.Element1Type,
				relation.Element2ID,
				relation.Element2Type,
				convertToPg((relation.element1_element2_value_to_modify || []).map((c) => toPgConnexion(c, false))),
				convertToPg((relation.element2_element1_value_to_modify || []).map((c) => toPgConnexion(c, true))),
				convertToPg(relation.existence),
				relation.originality,
				relation.impact,
				JSON.stringify(relation.symmetric_value_to_modify ?? [])
			]
		);
		return result.rows[0].id;
	}

	async get_all(): Promise<RelationData[]> {
		const result = await db.query(`
			SELECT relations.*,
				to_jsonb(element1_element2_connexions) AS element1_connexions_json,
				to_jsonb(element2_element1_connexions) AS element2_connexions_json,
					to_jsonb(existence) AS existence_json
			FROM relations
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'relation' as const,
			name: row.name,
			description: row.description,
			Element1ID: row.element1_id,
			Element1Type: row.element1_type,
			Element2ID: row.element2_id,
			Element2Type: row.element2_type,
			symmetric_value_to_modify: row.symmetric_connexions ?? [],
			element1_element2_value_to_modify: mapDatabaseConnexions(row.element1_connexions_json),
			element2_element1_value_to_modify: mapDatabaseConnexions(row.element2_connexions_json, true),
			existence: row.existence_json,
			originality: Number(row.originality),
			impact: Number(row.impact)
		}));
	}

	/** Generates one new value to modify of the relation, saves it and gives it a founding proof. */
	async addEntry(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		relationId: string,
		field: RelationListField
	): Promise<RelationData> {
		const relation = (await this.get_all()).find((item) => item.id === relationId);
		if (!relation) throw new Error('The relation to add a value to does not exist');

		const [element1, element2] = await Promise.all(
			[relation.Element1ID, relation.Element2ID].map(async (id) => (await loadElements([id]))[0])
		);
		if (!element1 || !element2) throw new Error('The elements of this relation do not exist');

		const reversed = field.startsWith('element2_element1');
		const symmetric = field.startsWith('symmetric');
		const source = reversed ? element2 : element1;
		const target = reversed ? element1 : element2;
		const connexionSchema = z.object({
			Element1Property: propertyEnum(element1.properties),
			Element2Property: propertyEnum(element2.properties),
			impact: z.number(),
			estimate: RelationEstimateSchema
		});

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nThe user wants to add one entry to "${field}" of a relation between:\nElement 1: ${JSON.stringify(element1)}\nElement 2: ${JSON.stringify(element2)}\n\nThe current entries of "${field}" are: ${JSON.stringify(relation[field])}\n\nCreate one new entry that does not repeat an existing one. ${
				`It is an existing value of ${JSON.stringify(target.name)} that ${JSON.stringify(source.name)} modifies: one property of each element and the impact of that relation.`
			} Element1Property always belongs to element 1 and Element2Property to element 2. ESTIMATE: for each entry, "estimate" says how the value of the source property gives an estimate of the value of the target property (the source is Element1Property for element1_element2_* and Element2Property for element2_element1_*; the symmetric_* entries are one link read in both directions). Choose the kind that fits the real mechanism: proportional (parameter = factor), additive (parameter = offset), inverse (parameter = constant), or points (at least two {source_value, estimated_value} points, for any other shape). The estimate is what the target value should be according to this relation alone, so where the two values are already consistent it must give the current target value. Use the units of the properties. A relation only links NUMBERS, FUNCTIONS (evolutions, probabilities, resources...) and BOOLEANS: never link a text or a list. An entry that links a text makes the whole relation impossible. Use numeric properties (for example the start or end probability of an event, or a financial resource).${
				symmetric ? ' The entry is SYMMETRIC: it works identically from element 1 to element 2 and from element 2 to element 1.' : ''
			}`,
			connexionSchema
		);

		assertRelatable([generated], element1.kinds, element2.kinds);
		const opposite = new Set(symmetric ? asymmetricPairs(relation) : symmetricPairs(relation));
		if (opposite.has(pairKey(generated))) throw new RelationRefusal('symmetry_conflict');

		const entries = [...relation[field], generated];
		const column = {
			symmetric_value_to_modify: 'symmetric_connexions',
			element1_element2_value_to_modify: 'element1_element2_connexions',
			element2_element1_value_to_modify: 'element2_element1_connexions'
		}[field];
		const value = symmetric
			? JSON.stringify(entries)
			: convertToPg(entries.map((connexion) => toPgConnexion(connexion, reversed)));
		await db.query(`UPDATE relations SET ${column} = $1 WHERE id = $2`, [value, relationId]);

		try {
			const { ProofServer } = await import('./Proof');
			await ProofServer.instance.createInitialProof(
				model_name,
				level_of_reasoning,
				prompt,
				{ relationId },
				{ type: 'relation', [field]: [generated] }
			);
		} catch (error) {
			console.error('Could not create the founding proof of the new relation value:', error);
		}

		return { ...relation, [field]: entries };
	}

	/**
	 * The originality of one value to modify of a relation: the genie looks for the value that the entry edits, compares the
	 * entry with all the other entries (of the other relations) that edit this same value, and gives a score. An
	 * asymmetric entry edits one value; a symmetric one edits the values of both elements, so it is scored for each of
	 * them and keeps the lowest score (it is as much a copy as its most copied side).
	 */
	async scoreValueOriginality(
		model_name: string,
		level_of_reasoning: string,
		relationId: string,
		field: RelationListField,
		entry: RelationData['element1_element2_value_to_modify'][number],
		contest?: { current: number; argument: unknown }
	): Promise<number> {
		const [relations, elements] = await Promise.all([this.get_all(), loadElements()]);
		const relation = relations.find((item) => item.id === relationId);
		if (!relation) return 50;
		const names = new Map(elements.map((element) => [element.id, element.name]));

		/** The values (element, property) that an entry of a list of a relation edits. */
		const editedBy = (
			item: RelationData,
			list: RelationListField,
			connexion: RelationData['element1_element2_value_to_modify'][number]
		) => {
			const first = { id: item.Element1ID, property: connexion.Element1Property };
			const second = { id: item.Element2ID, property: connexion.Element2Property };
			if (list === 'symmetric_value_to_modify') return [first, second];
			return list === 'element1_element2_value_to_modify' ? [second] : [first];
		};

		const candidate = {
			relation: { name: relation.name, description: relation.description },
			between: [names.get(relation.Element1ID), names.get(relation.Element2ID)],
			kind: field === 'symmetric_value_to_modify' ? 'symmetric' : 'asymmetric',
			direction: field,
			entry
		};

		const scores: number[] = [];
		for (const edited of editedBy(relation, field, entry)) {
			const others = relations.flatMap((item) =>
				RELATION_LIST_FIELDS.flatMap((list) =>
					item[list]
						.filter(
							(connexion) =>
								!(item.id === relationId && list === field && pairKey(connexion) === pairKey(entry)) &&
								editedBy(item, list, connexion).some(
									(other) => other.id === edited.id && other.property === edited.property
								)
						)
						.map((connexion) => ({
							relation: { name: item.name, description: item.description },
							between: [names.get(item.Element1ID), names.get(item.Element2ID)],
							kind: list === 'symmetric_value_to_modify' ? 'symmetric' : 'asymmetric',
							direction: list,
							entry: connexion
						}))
				)
			);
			scores.push(
				await this.scoreOriginality(
					model_name,
					level_of_reasoning,
					'relation value',
					{ ...candidate, edits: { element: names.get(edited.id), value: edited.property } },
					others,
					contest
				)
			);
		}
		return scores.length > 0 ? Math.min(...scores) : 50;
	}

	static instance = new RelationServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<RelationData> {
		return RelationServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async addEntry(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		relationId: string,
		field: RelationListField
	): Promise<RelationData> {
		return RelationServer.instance.addEntry(
			model_name,
			level_of_reasoning,
			prompt,
			relationId,
			field
		);
	}

	static async get_all(): Promise<RelationData[]> {
		return RelationServer.instance.get_all();
	}
}

export const Relation = RelationServer;
