import neo4j, { Session } from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';
import { z } from 'zod';

// ---------------------------------------------------------
// Anti-spam thresholds
// ---------------------------------------------------------
export const MIN_CREDIBILITY_THRESHOLD = 10; // 0 to 100
export const MIN_IMPACT_THRESHOLD = 0.05; // Absolute value

// ---------------------------------------------------------
// Multilingual Proof Schema
// ---------------------------------------------------------

export type ProofData = {
	id?: string;
	name_fr: string;
	name_en: string;
	name_de: string;
	name_es: string;
	description_fr: string;
	description_en: string;
	description_de: string;
	description_es: string;

	// Value or delta applied by this proof
	value?: number;
	targetField?: string;
	targetId?: string; // ID of organisation or parent element

	argument?: ProofData[];
	counterArgument?: ProofData[];

	source: string[];

	credibility: number; // 0 to 100
	impact: number; // e.g. -1.0 to 1.0 or numeric weight
};

export const ProofSchema: z.ZodType<ProofData> = z.lazy(() =>
	z.object({
		id: z.string().optional(),
		name_fr: z.string(),
		name_en: z.string(),
		name_de: z.string(),
		name_es: z.string(),
		description_fr: z.string(),
		description_en: z.string(),
		description_de: z.string(),
		description_es: z.string(),

		value: z.number().optional(),
		targetField: z.string().optional(),
		targetId: z.string().optional(),

		argument: z.array(ProofSchema).optional().default([]),
		counterArgument: z.array(ProofSchema).optional().default([]),

		source: z.array(z.string()).default([]),

		credibility: z.number().min(0).max(100),
		impact: z.number()
	})
);

export type ProofPaginationResult = {
	proofs: ProofData[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

// ---------------------------------------------------------
// Proof Class
// ---------------------------------------------------------

export class Proof {
	constructor(public data: ProofData) {}

	public static async init(data: ProofData, targetId?: string, relationshipType?: 'TARGETS' | 'HAS_ARGUMENT' | 'HAS_COUNTER_ARGUMENT') {
		const parsed = ProofSchema.parse(data);
		
		// Anti-spam validation: verify credibility and impact are not negligible
		if (parsed.credibility < MIN_CREDIBILITY_THRESHOLD || Math.abs(parsed.impact) < MIN_IMPACT_THRESHOLD) {
			throw new Error(
				`Proof rejected: Credibility (${parsed.credibility}) or impact (${parsed.impact}) is below the minimum threshold required.`
			);
		}

		const proof = new Proof(parsed);
		const createdData = await proof.addToDB(targetId, relationshipType);
		proof.data = createdData;
		return proof;
	}

	/**
	 * Compute the mathematical modification of a numeric value:
	 * finalValue = initialValue + (proofValue * impact * (credibility / 100))
	 */
	public static computeNumericModification(initialValue: number, proofValue: number, impact: number, credibility: number): number {
		const credibilityNormalized = Math.max(0, Math.min(100, credibility)) / 100;
		return initialValue + proofValue * impact * credibilityNormalized;
	}

	// -----------------------------------------------------
	// Database Persistence
	// -----------------------------------------------------

	async addToDB(targetId?: string, relationshipType: 'TARGETS' | 'HAS_ARGUMENT' | 'HAS_COUNTER_ARGUMENT' = 'TARGETS'): Promise<ProofData> {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
		const session = driver.session();

		try {
			const result = await session.run(
				`
				CREATE (p:Proof {
					name_fr: $name_fr,
					name_en: $name_en,
					name_de: $name_de,
					name_es: $name_es,
					description_fr: $description_fr,
					description_en: $description_en,
					description_de: $description_de,
					description_es: $description_es,
					value: $value,
					targetField: $targetField,
					source: $source,
					credibility: $credibility,
					impact: $impact,
					createdAt: datetime()
				})
				RETURN p, elementId(p) AS proofId
				`,
				{
					name_fr: this.data.name_fr,
					name_en: this.data.name_en,
					name_de: this.data.name_de,
					name_es: this.data.name_es,
					description_fr: this.data.description_fr,
					description_en: this.data.description_en,
					description_de: this.data.description_de,
					description_es: this.data.description_es,
					value: this.data.value ?? 0,
					targetField: this.data.targetField ?? '',
					source: this.data.source ?? [],
					credibility: this.data.credibility,
					impact: this.data.impact
				}
			);

			const proofNode = result.records[0].get('p');
			const proofId = result.records[0].get('proofId');

			// Link to target (Organisation or parent Proof)
			if (targetId) {
				if (relationshipType === 'HAS_ARGUMENT') {
					await session.run(
						`
						MATCH (parent:Proof), (p:Proof)
						WHERE (elementId(parent) = $targetId OR parent.name_fr = $targetId OR parent.name_en = $targetId)
						AND elementId(p) = $proofId
						CREATE (parent)-[:HAS_ARGUMENT]->(p)
						`,
						{ targetId, proofId }
					);
				} else if (relationshipType === 'HAS_COUNTER_ARGUMENT') {
					await session.run(
						`
						MATCH (parent:Proof), (p:Proof)
						WHERE (elementId(parent) = $targetId OR parent.name_fr = $targetId OR parent.name_en = $targetId)
						AND elementId(p) = $proofId
						CREATE (parent)-[:HAS_COUNTER_ARGUMENT]->(p)
						`,
						{ targetId, proofId }
					);
				} else {
					// Default: link to Organisation or entity
					await session.run(
						`
						MATCH (target), (p:Proof)
						WHERE (elementId(target) = $targetId OR target.name_fr = $targetId OR target.name_en = $targetId OR target.name = $targetId)
						AND elementId(p) = $proofId
						CREATE (target)-[:HAS_PROOF]->(p)
						`,
						{ targetId, proofId }
					);
				}
			}

			// Add nested arguments if provided
			if (this.data.argument && this.data.argument.length > 0) {
				for (const arg of this.data.argument) {
					await Proof.init(arg, proofId, 'HAS_ARGUMENT');
				}
			}

			// Add nested counter-arguments if provided
			if (this.data.counterArgument && this.data.counterArgument.length > 0) {
				for (const counterArg of this.data.counterArgument) {
					await Proof.init(counterArg, proofId, 'HAS_COUNTER_ARGUMENT');
				}
			}

			return {
				...Proof.formatNodeProps(proofNode.properties, proofId)
			};
		} finally {
			await session.close();
			await driver.close();
		}
	}

	// -----------------------------------------------------
	// Query Methods with Pagination & Sorting
	// -----------------------------------------------------

	/**
	 * Get top proofs for an organisation or entity, sorted by credibility * abs(impact) descending
	 */
	public static async getProofsForTarget(
		targetNameOrId: string,
		page: number = 1,
		pageSize: number = 5
	): Promise<ProofPaginationResult> {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
		const session = driver.session();
		const skip = Math.max(0, (page - 1) * pageSize);

		try {
			// Count total
			const countResult = await session.run(
				`
				MATCH (target)-[:HAS_PROOF]->(p:Proof)
				WHERE elementId(target) = $targetNameOrId 
				   OR target.name_fr = $targetNameOrId 
				   OR target.name_en = $targetNameOrId 
				   OR target.name_de = $targetNameOrId 
				   OR target.name_es = $targetNameOrId
				   OR target.name = $targetNameOrId
				RETURN count(p) AS total
				`,
				{ targetNameOrId }
			);

			const total = countResult.records[0]?.get('total')?.toNumber
				? countResult.records[0].get('total').toNumber()
				: Number(countResult.records[0]?.get('total') ?? 0);

			// Fetch paginated proofs ordered by importance (credibility * abs(impact))
			const result = await session.run(
				`
				MATCH (target)-[:HAS_PROOF]->(p:Proof)
				WHERE elementId(target) = $targetNameOrId 
				   OR target.name_fr = $targetNameOrId 
				   OR target.name_en = $targetNameOrId 
				   OR target.name_de = $targetNameOrId 
				   OR target.name_es = $targetNameOrId
				   OR target.name = $targetNameOrId
				OPTIONAL MATCH (p)-[:HAS_ARGUMENT]->(a:Proof)
				OPTIONAL MATCH (p)-[:HAS_COUNTER_ARGUMENT]->(c:Proof)
				WITH p, count(DISTINCT a) AS argumentCount, count(DISTINCT c) AS counterArgumentCount
				RETURN p, elementId(p) AS proofId, argumentCount, counterArgumentCount
				ORDER BY (p.credibility * abs(p.impact)) DESC
				SKIP $skip
				LIMIT $limit
				`,
				{ targetNameOrId, skip: neo4j.int(skip), limit: neo4j.int(pageSize) }
			);

			const proofs: ProofData[] = result.records.map((r) => {
				const props = r.get('p').properties;
				const proofId = r.get('proofId');
				return Proof.formatNodeProps(props, proofId);
			});

			return {
				proofs,
				total,
				page,
				pageSize,
				totalPages: Math.ceil(total / pageSize) || 1
			};
		} finally {
			await session.close();
			await driver.close();
		}
	}

	/**
	 * Get arguments or counter-arguments for a specific proof
	 */
	public static async getChildProofs(
		proofId: string,
		type: 'argument' | 'counterArgument',
		page: number = 1,
		pageSize: number = 5
	): Promise<ProofPaginationResult> {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
		const session = driver.session();
		const skip = Math.max(0, (page - 1) * pageSize);
		const relType = type === 'argument' ? 'HAS_ARGUMENT' : 'HAS_COUNTER_ARGUMENT';

		try {
			const countResult = await session.run(
				`
				MATCH (parent:Proof)-[:${relType}]->(child:Proof)
				WHERE elementId(parent) = $proofId
				RETURN count(child) AS total
				`,
				{ proofId }
			);

			const total = countResult.records[0]?.get('total')?.toNumber
				? countResult.records[0].get('total').toNumber()
				: Number(countResult.records[0]?.get('total') ?? 0);

			const result = await session.run(
				`
				MATCH (parent:Proof)-[:${relType}]->(child:Proof)
				WHERE elementId(parent) = $proofId
				RETURN child, elementId(child) AS childId
				ORDER BY (child.credibility * abs(child.impact)) DESC
				SKIP $skip
				LIMIT $limit
				`,
				{ proofId, skip: neo4j.int(skip), limit: neo4j.int(pageSize) }
			);

			const proofs: ProofData[] = result.records.map((r) => {
				const props = r.get('child').properties;
				const childId = r.get('childId');
				return Proof.formatNodeProps(props, childId);
			});

			return {
				proofs,
				total,
				page,
				pageSize,
				totalPages: Math.ceil(total / pageSize) || 1
			};
		} finally {
			await session.close();
			await driver.close();
		}
	}

	private static formatNodeProps(props: Record<string, unknown>, id?: string): ProofData {
		const toNumber = (val: unknown, fallback: number = 0) =>
			typeof val === 'object' && val !== null && 'toNumber' in val
				? (val as { toNumber: () => number }).toNumber()
				: Number(val ?? fallback);

		return {
			id: id || (typeof props.id === 'string' ? props.id : undefined),
			name_fr: String(props.name_fr ?? props.name ?? ''),
			name_en: String(props.name_en ?? props.name ?? ''),
			name_de: String(props.name_de ?? props.name ?? ''),
			name_es: String(props.name_es ?? props.name ?? ''),
			description_fr: String(props.description_fr ?? props.description ?? ''),
			description_en: String(props.description_en ?? props.description ?? ''),
			description_de: String(props.description_de ?? props.description ?? ''),
			description_es: String(props.description_es ?? props.description ?? ''),
			value: props.value !== undefined ? toNumber(props.value) : undefined,
			targetField: typeof props.targetField === 'string' ? props.targetField : undefined,
			source: Array.isArray(props.source) ? props.source.map(String) : [],
			credibility: toNumber(props.credibility, 50),
			impact: toNumber(props.impact, 0.5),
			argument: [],
			counterArgument: []
		};
	}
}
