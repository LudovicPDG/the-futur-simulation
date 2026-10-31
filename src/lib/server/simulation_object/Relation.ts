import { BaseSimulationObject } from './BaseSimulationObject';
import {
	RelationConnexionSchema,
	RelationElementTypeSchema,
	RelationSchema,
	type RelationData
} from '$lib/simulation/Relation';
import { convertToPg } from './PgConversion';
import { db } from '../utils/database';
import { z } from 'zod';
import type { RelationListField } from '$lib/simulation/Relation';

const commonElementProperties = [
	'name',
	'description',
	'other',
	'impossibility',
	'end_impossibility',
	'start_probability_distribution',
	'end_probability_distribution',
	'originality'
];

const propertiesByType: Record<string, string[]> = {
	fact: [],
	person: ['financial_resource', 'power'],
	organization: ['financial_resource', 'power', 'human_resource'],
	interest_group: ['financial_resource', 'power', 'human_resource', 'willing', 'satisfaction'],
	action: [
		'material_resource_used',
		'material_resource_necessary',
		'fund_used',
		'fund_necessary',
		'human_mobilized',
		'human_necessary'
	],
	event: [],
	evolution: ['evolution', 'unit'],
	ranking: ['rankings'],
	material_resource: ['number_of_units', 'financial_value', 'power']
};

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
			impact: fields.impact
		});
	});
}

/** Every element a relation can link, with the names of the properties a relation can target. */
async function loadElements(ids?: string[]) {
	const result = await db.query(
		`
		SELECT f.id, lower(f.type) AS type, (f.name).fr AS name_fr, (f.name).en AS name_en, to_jsonb(f.other) AS other,
			to_jsonb(COALESCE(c.power, m.power)) AS power, to_jsonb(ig.willing) AS willing,
			to_jsonb(a.material_resource_used || a.material_resource_necessary) AS action_materials
		FROM facts f
		LEFT JOIN actions a ON a.id = f.id
		LEFT JOIN characters c ON c.id = f.id
		LEFT JOIN material_resources m ON m.id = f.id
		LEFT JOIN interest_groups ig ON ig.id = f.id
		WHERE lower(f.type) = ANY($1::text[]) AND ($2::uuid[] IS NULL OR f.id = ANY($2::uuid[]))
	`,
		[RelationElementTypeSchema.options, ids ?? null]
	);
	return result.rows.map((row) => ({
		id: row.id as string,
		type: row.type as string,
		name: { fr: row.name_fr, en: row.name_en },
		properties: [
			...commonElementProperties,
			...(propertiesByType[row.type] || []),
			...getAdditionalPropertyNames(row.other),
			...getAdditionalPropertyNames(row.power),
			...getAdditionalPropertyNames(row.willing),
			...getAdditionalPropertyNames(row.action_materials)
		]
	}));
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
			impact: z.number()
		});
		const valueSchema = z.union([z.string(), z.number(), z.boolean()]);
		const generatedSchema = RelationSchema.extend({
			Element1ID: z.literal(element1.id),
			Element1Type: z.literal(element1.type),
			Element2ID: z.literal(element2.id),
			Element2Type: z.literal(element2.type),
			element1_element2_value_to_modify: z.array(connexionSchema),
			element2_element1_value_to_modify: z.array(connexionSchema),
			element1_element2_new_value: z.array(connexionSchema.extend({ value: valueSchema })),
			element2_element1_new_value: z.array(connexionSchema.extend({ value: valueSchema }))
		});

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nCreate the relation between these already-selected elements. Do not change their IDs or types.\nElement 1: ${JSON.stringify(element1)}\nElement 2: ${JSON.stringify(element2)}\n\nelement1_element2_value_to_modify lists the existing values of element 2 that element 1 modifies: Element1Property is selected from element 1 properties and Element2Property from element 2 properties; impact is the strength of that property-to-property relation. element1_element2_new_value lists values element 1 adds to element 2: Element1Property is an existing element 1 property, Element2Property is the name of the new value (it may be a new name), value is the created value and impact its strength. For the element2_element1_* fields, reverse those choices.`,
			generatedSchema
		);

		return RelationSchema.parse(generated);
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
				element1_element2_new_value,
				element2_element1_new_value,
				existence,
				originality,
				impact
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
			[
				convertToPg(relation.name),
				convertToPg(relation.description),
				relation.Element1ID,
				relation.Element1Type,
				relation.Element2ID,
				relation.Element2Type,
				convertToPg(
					(relation.element1_element2_value_to_modify || []).map((connexion) => ({
						SourceProperty: connexion.Element1Property,
						TargetProperty: connexion.Element2Property,
						impact: connexion.impact
					}))
				),
				convertToPg(
					(relation.element2_element1_value_to_modify || []).map((connexion) => ({
						Element2Property: connexion.Element2Property,
						Element1Property: connexion.Element1Property,
						impact: connexion.impact
					}))
				),
				JSON.stringify(relation.element1_element2_new_value ?? []),
				JSON.stringify(relation.element2_element1_new_value ?? []),
				convertToPg(relation.existence),
				relation.originality,
				relation.impact
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
			element1_element2_value_to_modify: mapDatabaseConnexions(row.element1_connexions_json),
			element2_element1_value_to_modify: mapDatabaseConnexions(row.element2_connexions_json, true),
			element1_element2_new_value: row.element1_element2_new_value ?? [],
			element2_element1_new_value: row.element2_element1_new_value ?? [],
			existence: row.existence_json,
			originality: Number(row.originality),
			impact: Number(row.impact)
		}));
	}

	/** Generates one new value to modify or to add of the relation, saves it and gives it a founding proof. */
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
		const source = reversed ? element2 : element1;
		const target = reversed ? element1 : element2;
		const isNew = field.endsWith('new_value');
		const connexionSchema = z.object({
			Element1Property: propertyEnum(element1.properties),
			Element2Property: propertyEnum(element2.properties),
			impact: z.number()
		});
		const valueSchema = z.union([z.string(), z.number(), z.boolean()]);
		const schema = isNew ? connexionSchema.extend({ value: valueSchema }) : connexionSchema;

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nThe user wants to add one entry to "${field}" of a relation between:\nElement 1: ${JSON.stringify(element1)}\nElement 2: ${JSON.stringify(element2)}\n\nThe current entries of "${field}" are: ${JSON.stringify(relation[field])}\n\nCreate one new entry that does not repeat an existing one. ${
				isNew
					? `It is a value that ${JSON.stringify(source.name)} adds to ${JSON.stringify(target.name)}: the property of the source is an existing property, the property of the target is the name of the new value (it may be a new name), value is the created value and impact its strength.`
					: `It is an existing value of ${JSON.stringify(target.name)} that ${JSON.stringify(source.name)} modifies: one property of each element and the impact of that relation.`
			} Element1Property always belongs to element 1 and Element2Property to element 2.`,
			schema
		);

		const entries = [...relation[field], generated];
		const column = {
			element1_element2_value_to_modify: 'element1_element2_connexions',
			element2_element1_value_to_modify: 'element2_element1_connexions',
			element1_element2_new_value: 'element1_element2_new_value',
			element2_element1_new_value: 'element2_element1_new_value'
		}[field];
		const value = isNew
			? JSON.stringify(entries)
			: convertToPg(
					entries.map((connexion) =>
						reversed
							? {
									Element2Property: connexion.Element2Property,
									Element1Property: connexion.Element1Property,
									impact: connexion.impact
								}
							: {
									SourceProperty: connexion.Element1Property,
									TargetProperty: connexion.Element2Property,
									impact: connexion.impact
								}
					)
				);
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
