import type { Relation } from '../Relation.js';
import type { Simulation_Action } from '../Action.js';
import type { Organization } from '../Organization.js';

export abstract class AbstractFact {
	constructor(
		private name: string,
		private description: string,
		private impact: Array<Relation<AbstractFact | Simulation_Action | Organization>>
	) {}
}
