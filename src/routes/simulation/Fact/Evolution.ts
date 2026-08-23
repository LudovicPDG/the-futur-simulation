import type { MathNode } from 'mathjs';
import { AbstractFact } from './AbstractFact.js';
import type { Relation } from '../Relation.js';
import type { Simulation_Action } from '../Action.js';
import type { Organization } from '../Organization.js';

export class Evolution extends AbstractFact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<AbstractFact | Simulation_Action | Organization>>,
		private evolution: MathNode,
		private unit: string,
		private probability: number
	) {
		super(name, description, impact);
	}
}
