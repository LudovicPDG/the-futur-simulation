import type { Relation } from './Relation.js';
import type { Simulation_Action } from './Action.js';

export class Organization {
	constructor(
		private name: string,
		private description: string,
		private type: string,
		private satisfaction: number,
		private relation: Array<Relation<Simulation_Action | Organization>>
	) {}
}
