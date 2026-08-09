import { neo4j_driver } from '$lib/server/utils/database';

export default class Proof {
	private ID: string;

	constructor(
		private name: string,
		private description: string,
		private value: any,
		private valueToEdit: any,
		private author: string,
		private source: string[],
		private credibility: number, // decimal number between 0 and 1
		private impact: number, // decimal number between 0 and 1
		private proof: Proof
	) {
		this.ID = crypto.randomUUID();
	}

	static async create(
		name: string,
		description: string,
		value: any,
		valueToEdit: any,
		author: string,
		source: string[],
		parent: Proof,
		child: Set<Proof>,
		credibility: number,
		impact: number
	) {
		const proof = new Proof(
			parent,
			child,
			name,
			description,
			value,
			valueToEdit,
			author,
			source,
			credibility,
			impact
		);

		const session = neo4j_driver.session();

		try {
			await session.run(
				`
				CREATE (p:Proof {
					id: $id,
					name: $name,
					description: $description,
					value: $value,
					author: $author,
					credibility: $credibility,
					impact: $impact
				})
				`,
				{
					id: proof.ID,
					name,
					description,
					value,
					author,
					credibility,
					impact
				}
			);
			/*
			TODO: créer les relations avec
			source: string[],
			argument: Set<Proof>,
			conter_argument: Set<Proof>
			*/
		} finally {
			await session.close();
		}

		return proof;
	}

	get getTheValue() {
		return this.value;
	}

	get getCredibility() {
		return this.credibility;
	}

	get getImpact() {
		return this.impact;
	}
}
