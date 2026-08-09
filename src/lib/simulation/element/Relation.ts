import type { MathNode } from 'mathjs';
import Proof from './Proof';
import { neo4j_driver } from '$lib/server/utils/database';

export default class Relation {
	private ID: string;

	private constructor(
		private name: string,
		private description: string,
		private from: any,
		private to: any,
		private type: string,
		private strength: number
	) {
		this.ID = crypto.randomUUID();
	}

	static async create(
		name: string,
		description: string,
		from: any,
		to: any,
		type: string,
		strength: number
	) {
		const relation = new Relation(name, description, from, to, type, strength);

		const session = neo4j_driver.session();

		try {
			await session.run(
				`
				CREATE (r:Relation {
					id: $id,
					name: $name,
					description: $description,
					type: $type
				})
				`,
				{
					id: relation.ID,
					name: name,
					description: description,
					type: type
				}
			);

			// TODO: Create relations with from, to, and strength
		} finally {
			await session.close();
		}

		return relation;
	}

	getID(): string {
		return this.ID;
	}
}
