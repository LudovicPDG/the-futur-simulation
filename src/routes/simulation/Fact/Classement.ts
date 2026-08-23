import { AbstractFact } from './AbstractFact.js';
import type { Relation } from '../Relation.js';
import type { Simulation_Action } from '../Action.js';
import type { Organization } from '../Organization.js';

export class Rank {
	constructor(
		private name: string,
		private description: string,
		private value: number,
		private unit: string
	) {}
}

export class Classement extends AbstractFact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<AbstractFact | Simulation_Action | Organization>>,
		private probability: number,
		private ranking: Array<Rank>
	) {
		super(name, description, impact);
	}
}
