import { Character, Ressource, Right } from './Character';
import { neo4j_driver } from '$lib/server/utils/database';

export default class Person extends Character {
	constructor(
		name: string,
		description: string,
		type: string,
		capital: Set<Ressource>,
		revenue: Set<Ressource>,
		expenses: Set<Ressource>,
		satisfaction: number,
		other: Map<String, any>,
		rights: Set<Right>
	) {
		super(name, description, type, capital, revenue, expenses, satisfaction, other, rights);
	}

	static async create(
		name: string,
		description: string,
		type: string,
		capital: Set<Ressource>,
		revenue: Set<Ressource>,
		expenses: Set<Ressource>,
		satisfaction: number,
		other: Map<String, any>,
		rights: Set<Right>
	) {
		const person = new Person(
			name,
			description,
			type,
			capital,
			revenue,
			expenses,
			satisfaction,
			other,
			rights
		);

		const session = neo4j_driver.session();

		try{
			await session.run(
				`CREATE (p:Person { id: $id }) -[HAVE]-> (h1: Hypothesis { id: $id, name})`
			)
		}
	}
}
