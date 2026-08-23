import type { Relation } from './Relation.js';
import type { AbstractFact } from './Fact/AbstractFact.js';

export class Simulation_Action {
	constructor(
		private name: string,
		private description: string,
		private probability: number,
		private relation: Array<Relation<AbstractFact>>
	) {}
}

export { Simulation_Action as SimulationAction };


