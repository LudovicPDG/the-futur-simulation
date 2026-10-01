import { BaseSimulationObject } from './BaseSimulationObject';
import {
	RelationConnexionSchema,
	RelationElementTypeSchema,
	RelationSchema,
	type RelationData
} from '$lib/simulation/Relation';
import { convertToPg } from './Genie';
import { db } from '../utils/database';
import { z } from 'zod';

const commonElementProperties = [
	'name',
	'description',
	'other',
	'impossibility',
	'probability_distribution',
	'originality'
];

const propertiesByType: Record<string, string[]> = {
	fact: [],
	person: ['financial_resource', 'power'],
	organization: ['financial_resource', 'power', 'human_resource'],
	interest_group: ['financial_resource', 'power', 'human_resource'],
	action: ['material_resource_used', 'fund_used', 'human_mobilized'],
	event: [],
	evolution: ['evolution', 'unit'],
	ranking: ['rankings'],
	material_resource: ['number_of_units', 'financial_value', 'power']
};

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
): RelationData['element1_element2_connexions'] {
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

export class RelationServer extends BaseSimulationObject<RelationData> {
	protected schema = RelationSchema;
	protected typeName = 'relation';
	protected tableName = 'relations';

	protected override async generate(
		model_name: string,
		level_of_reasoning: string,
		prompt: string
	): Promise<RelationData> {
		const result = await db.query(
			`
			SELECT id, type, (name).fr AS name_fr, (name).en AS name_en, to_jsonb(other) AS other
			FROM facts
			WHERE type = ANY($1::text[])
		`,
			[RelationElementTypeSchema.options]
		);
		const elements = result.rows.map((row) => ({
			id: row.id,
			type: row.type,
			name: { fr: row.name_fr, en: row.name_en },
			properties: [
				...commonElementProperties,
				...(propertiesByType[row.type] || []),
				...getAdditionalPropertyNames(row.other)
			]
		}));
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
		const generatedSchema = RelationSchema.extend({
			Element1ID: z.literal(element1.id),
			Element1Type: z.literal(element1.type),
			Element2ID: z.literal(element2.id),
			Element2Type: z.literal(element2.type),
			element1_element2_connexions: z.array(
				z.object({
					Element1Property: element1Property,
					Element2Property: element2Property,
					impact: z.number()
				})
			),
			element2_element1_connexions: z.array(
				z.object({
					Element1Property: element1Property,
					Element2Property: element2Property,
					impact: z.number()
				})
			)
		});

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nCreate the relation between these already-selected elements. Do not change their IDs or types.\nElement 1: ${JSON.stringify(element1)}\nElement 2: ${JSON.stringify(element2)}\n\nFor element1_element2_connexions, Element1Property must be selected from element 1 properties and Element2Property from element 2 properties. For element2_element1_connexions, reverse those choices. Each connexion describes how these two properties relate; impact is the strength of that property-to-property relation.`,
			generatedSchema
		);

		return RelationSchema.parse(generated);
	}

	async insert_in_db(relation: RelationData): Promise<void> {
		await db.query(
			`INSERT INTO relations (
				name,
				description,
				element1_id,
				element1_type,
				element2_id,
				element2_type,
				element1_element2_connexions,
				element2_element1_connexions,
				impossibility,
				probability_distribution,
				originality
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			[
				convertToPg(relation.name),
				convertToPg(relation.description),
				relation.Element1ID,
				relation.Element1Type,
				relation.Element2ID,
				relation.Element2Type,
				convertToPg(
					(relation.element1_element2_connexions || []).map((connexion) => ({
						SourceProperty: connexion.Element1Property,
						TargetProperty: connexion.Element2Property,
						impact: connexion.impact
					}))
				),
				convertToPg(
					(relation.element2_element1_connexions || []).map((connexion) => ({
						Element2Property: connexion.Element2Property,
						Element1Property: connexion.Element1Property,
						impact: connexion.impact
					}))
				),
				relation.impossibility,
				relation.probability_distribution,
				relation.originality
			]
		);
	}

	async get_all(): Promise<RelationData[]> {
		const result = await db.query(`
			SELECT relations.*,
				to_jsonb(element1_element2_connexions) AS element1_connexions_json,
				to_jsonb(element2_element1_connexions) AS element2_connexions_json
			FROM relations
		`);

		return result.rows.map((row) => ({
			type: 'relation' as const,
			name: row.name,
			description: row.description,
			Element1ID: row.element1_id,
			Element1Type: row.element1_type,
			Element2ID: row.element2_id,
			Element2Type: row.element2_type,
			element1_element2_connexions: mapDatabaseConnexions(row.element1_connexions_json),
			element2_element1_connexions: mapDatabaseConnexions(row.element2_connexions_json, true),
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality)
		}));
	}

	static instance = new RelationServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<RelationData> {
		return RelationServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<RelationData[]> {
		return RelationServer.instance.get_all();
	}
}

export const Relation = RelationServer;
