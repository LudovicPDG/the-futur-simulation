import { BaseSimulationObject } from './BaseSimulationObject';
import { RelationSchema, type RelationData } from '$lib/simulation/Relation';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

export class RelationServer extends BaseSimulationObject<RelationData> {
	protected schema = RelationSchema;
	protected typeName = 'relation';
	protected tableName = 'relations';

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
				convertToPg(relation.element1_element2_connexions || []),
				convertToPg(relation.element2_element1_connexions || []),
				relation.impossibility,
				relation.probability_distribution,
				relation.originality
			]
		);
	}

	async get_all(): Promise<RelationData[]> {
		const result = await db.query(`
			SELECT *
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
			element1_element2_connexions: row.element1_element2_connexions || [],
			element2_element1_connexions: row.element2_element1_connexions || [],
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
