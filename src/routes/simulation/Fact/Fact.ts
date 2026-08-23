import type { MathNode } from 'mathjs';
import { AbstractFact } from './AbstractFact.js';
import type { Relation } from '../Relation.js';
import type { Simulation_Action } from '../Action.js';
import type { Organization } from '../Organization.js';

export class Fact extends AbstractFact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<AbstractFact | Simulation_Action | Organization>>,
		private probability: MathNode
	) {
		super(name, description, impact);
	}
}
