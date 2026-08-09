import { neo4j_driver } from '$lib/server/utils/database';

export default class Fact {
	private ID: string;

	private constructor(
		private name: string,
		private description: string,
		private probability: number
	) {
		this.ID = crypto.randomUUID();
	}

	static async create(
		name: string,
		description: string,
		probability: number
	) {
		const fact = new Fact(name, description, probability);

		const session = neo4j_driver.session();

		try {
			await session.run(
				`
				CREATE (f:Fact {
					id: $id,
					name: $name,
					description: $description
				})
				`,
				{
					id: fact.ID,
					name: name,
					description: description
				}
			);
			/*
			TODO: créer les relations avec
			probability: Hypothesis<number>
			*/
		} finally {
			await session.close();
		}

		return fact;
	}

	getID(): string {
		return this.ID;
	}
}
