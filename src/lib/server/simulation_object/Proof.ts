import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BaseSimulationObject } from './BaseSimulationObject';
import { ProofSchema, type ProofData } from '$lib/simulation/Proof';
import { ModificationSchema } from '$lib/simulation/Modification';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

/** The element a proof is about: a fact (or subtype) or a relation. */
type ProofTarget = { factId: string } | { relationId: string };

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

	/** Debate: creates a sub-proof of an existing proof (the fact is the one of the parent). */
	async createSubProof(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		parentProofId: string
	): Promise<ProofData> {
		const parent = await db.query(`SELECT fact_id, relation_id FROM proofs WHERE id = $1`, [
			parentProofId
		]);
		const target: ProofTarget | undefined = parent.rows[0]?.fact_id
			? { factId: parent.rows[0].fact_id }
			: parent.rows[0]?.relation_id
				? { relationId: parent.rows[0].relation_id }
				: undefined;
		if (!target) {
			throw new Error('The debated proof does not exist or is not linked to an element');
		}

		const data = await this.generateForTarget(
			model_name,
			level_of_reasoning,
			prompt,
			target,
			parentProofId
		);
		await this.insert_in_db(data);
		return data;
	}

	/** Founding proof of a freshly created fact or relation: the source and information it is based on. */
	async createInitialProof(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		factValues: Partial<
			Pick<ProofData, 'impossibility' | 'probability_distribution' | 'originality'>
		> = {}
	): Promise<ProofData> {
		const generated = await this.generateForTarget(
			model_name,
			level_of_reasoning,
			prompt,
			target,
			undefined,
			'Create the founding proof of this element: the source and the information it is based on (documents, data, statements, observations). The sources must be real and verifiable. This proof will be the starting point of the debate about this element.'
		);
		// The founding proof shares impossibility, probability distribution and originality with its element.
		const data: ProofData = {
			...generated,
			...Object.fromEntries(Object.entries(factValues).filter(([, value]) => value !== undefined))
		};
		await this.insert_in_db(data);
		return data;
	}

	private async generateForTarget(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		target: ProofTarget,
		parentProofId?: string,
		instruction?: string
	): Promise<ProofData> {
		let context: string;
		if ('factId' in target) {
			const fact = await db.query(
				`SELECT type, (name).fr AS name_fr, (name).en AS name_en,
					(description).fr AS description_fr, (description).en AS description_en
				FROM facts WHERE id = $1`,
				[target.factId]
			);
			if (fact.rows.length === 0) throw new Error('The debated element does not exist');
			context = `

This proof is about the following simulation element:
${JSON.stringify(fact.rows[0])}`;
		} else {
			const relation = await db.query(
				`SELECT (r.name).fr AS name_fr, (r.name).en AS name_en,
					(r.description).fr AS description_fr, (r.description).en AS description_en,
					r.element1_type, (e1.name).fr AS element1_name_fr, (e1.name).en AS element1_name_en,
					r.element2_type, (e2.name).fr AS element2_name_fr, (e2.name).en AS element2_name_en
				FROM relations r
				JOIN facts e1 ON e1.id = r.element1_id
				JOIN facts e2 ON e2.id = r.element2_id
				WHERE r.id = $1`,
				[target.relationId]
			);
			if (relation.rows.length === 0) throw new Error('The debated relation does not exist');
			context = `

This proof is about the following relation between two simulation elements:
${JSON.stringify(relation.rows[0])}`;
		}

		if (parentProofId) {
			const parent = await db.query(
				`SELECT (name).fr AS name_fr, (name).en AS name_en,
					(description).fr AS description_fr, (description).en AS description_en,
					(verification_method).fr AS verification_method_fr,
					(falsifiability_method).fr AS falsifiability_method_fr,
					source
				FROM proofs WHERE id = $1`,
				[parentProofId]
			);
			if (parent.rows.length === 0) throw new Error('The debated proof does not exist');
			context += `\n\nThis proof is a sub-proof: it debates (supports, questions or refutes) the following existing proof:\n${JSON.stringify(parent.rows[0])}`;
		}

		const proof = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			prompt + context + (instruction ? `

${instruction}` : ''),
			ProofSchema
		);

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
				modification,
				verification_method,
				falsifiability_method,
				source,
				impossibility,
				probability_distribution,
				originality,
				fact_id,
				relation_id,
				parent_proof_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
			[
				proof.id ?? randomUUID(),
				convertToPg(proof.name),
				convertToPg(proof.description),
				JSON.stringify(proof.modification ?? ModificationSchema.parse({})),
				convertToPg(proof.verification_method),
				convertToPg(proof.falsifiability_method),
				convertToPg(proof.source || []),
				proof.impossibility,
				convertToPg(proof.probability_distribution),
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
			ORDER BY created_at DESC
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'proof' as const,
			name: row.name,
			description: row.description,
			modification: ModificationSchema.parse(row.modification ?? {}),
			verification_method: row.verification_method,
			falsifiability_method: row.falsifiability_method,
			source: row.source || [],
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			fact_id: row.fact_id,
			relation_id: row.relation_id,
			parent_proof_id: row.parent_proof_id
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

	static async get_all(): Promise<ProofData[]> {
		return ProofServer.instance.get_all();
	}
}

export const Proof = ProofServer;
