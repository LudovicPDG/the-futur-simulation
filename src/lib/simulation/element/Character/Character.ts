import { neo4j_driver } from '$lib/server/utils/database';

export abstract class Character {
	private ID: string;
	constructor(
		private name: string,
		private description: string,
		private type: string,
		private capital: Set<Ressource>,
		private revenue: Set<Ressource>,
		private expenses: Set<Ressource>,
		private satisfaction: number,
		private other: Map<String, any>,
		private rights: Set<Right>
	) {
		this.ID = crypto.randomUUID();
	}
}

export class Ressource {
	constructor(
		private ID: number,
		private name: string,
		private description: string,
		private number: number,
		private price: number
	) {}
}

export class Right {
	constructor(
		private ID: number,
		private name: string,
		private description: string,
		private respectability_rate: number
	) {}
}
