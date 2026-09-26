import { BaseSimulationObject } from './BaseSimulationObject';
import { ProofSchema, type ProofData } from '$lib/simulation/Proof';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

export class ProofServer extends BaseSimulationObject<ProofData> {
	protected schema = ProofSchema;
	protected typeName = 'proof';
	protected tableName = 'proofs';

	async insert_in_db(proof: ProofData): Promise<void> {
		await db.query(
			`INSERT INTO proofs (
				name,
				description,
				new_value,
				verification_method,
				falsifiability_method,
				source,
				impossibility,
				probability_distribution,
				originality
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				convertToPg(proof.name),
				convertToPg(proof.description),
				proof.new_value !== undefined ? JSON.stringify(proof.new_value) : null,
				convertToPg(proof.verification_method),
				convertToPg(proof.falsifiability_method),
				convertToPg(proof.source || []),
				proof.impossibility,
				proof.probability_distribution,
				proof.originality
			]
		);
	}

	async get_all(): Promise<ProofData[]> {
		const result = await db.query(`
			SELECT *
			FROM proofs
		`);

		return result.rows.map((row) => ({
			type: 'proof' as const,
			name: row.name,
			description: row.description,
			new_value: row.new_value,
			verification_method: row.verification_method,
			falsifiability_method: row.falsifiability_method,
			source: row.source || [],
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality)
		}));
	}

	static instance = new ProofServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<ProofData> {
		return ProofServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<ProofData[]> {
		return ProofServer.instance.get_all();
	}
}

export const Proof = ProofServer;
