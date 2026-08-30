import neo4j, { Session } from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';

import { z } from 'zod';

// ---------------------------------------------------------
// Schema
// ---------------------------------------------------------

export const ProofSchema: z.ZodType<ProofData> = z.lazy(() =>
	z.object({
		name: z.string(),
		description: z.string(),

		argument: z.array(ProofSchema),
		counterArgument: z.array(ProofSchema),

		source: z.array(z.string()),

		credibility: z.number().min(0).max(100),
		impact: z.number()
	})
);

export type ProofData = {
	name: string;
	description: string;

	argument: ProofData[];
	counterArgument: ProofData[];

	source: string[];

	credibility: number;
	impact: number;
};

// ---------------------------------------------------------
// Class
// ---------------------------------------------------------

export class Proof {
	constructor(public data: ProofData) {}

	public static async init(data: ProofData) {
		const proof = new Proof(ProofSchema.parse(data));

		await proof.add_to_DB();

		return proof;
	}

	// -----------------------------------------------------
	// Database
	// -----------------------------------------------------

	async add_to_DB() {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));

		const session = driver.session();

		try {
			const result = await session.run(
				`
				CREATE (p:Proof {
					name: $name,
					description: $description,
					source: $source,
					credibility: $credibility,
					impact: $impact
				})

				RETURN p
				`,
				{
					name: this.data.name,
					description: this.data.description,
					source: this.data.source,
					credibility: this.data.credibility,
					impact: this.data.impact
				}
			);

			const proof = result.records[0].get('p');

			// Arguments
			for (const argument of this.data.argument) {
				const argumentProof = await this.createProof(session, argument);

				await session.run(
					`
					MATCH (p:Proof), (a:Proof)
					WHERE elementId(p) = $proofId
					AND elementId(a) = $argumentId

					CREATE (p)-[:HAS_ARGUMENT]->(a)
					`,
					{
						proofId: proof.elementId,
						argumentId: argumentProof.elementId
					}
				);
			}

			// Counter arguments
			for (const counterArgument of this.data.counterArgument) {
				const counterProof = await this.createProof(session, counterArgument);

				await session.run(
					`
					MATCH (p:Proof), (c:Proof)
					WHERE elementId(p) = $proofId
					AND elementId(c) = $counterId

					CREATE (p)-[:HAS_COUNTER_ARGUMENT]->(c)
					`,
					{
						proofId: proof.elementId,
						counterId: counterProof.elementId
					}
				);
			}

			return proof.properties;
		} finally {
			await session.close();
			await driver.close();
		}
	}

	// -----------------------------------------------------
	// Create a child Proof
	// -----------------------------------------------------

	private async createProof(session: Session, data: ProofData) {
		const result = await session.run(
			`
			CREATE (p:Proof {
				name: $name,
				description: $description,
				source: $source,
				credibility: $credibility,
				impact: $impact
			})

			RETURN p
			`,
			{
				name: data.name,
				description: data.description,
				source: data.source,
				credibility: data.credibility,
				impact: data.impact
			}
		);

		return result.records[0].get('p');
	}
}
