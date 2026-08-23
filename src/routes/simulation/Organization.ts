import type { Action } from 'lottie-react';

class Organization {
	constructor(
		private name: string,
		private description: string,
		private type: string,
		private satisfaction: number,
		private relation: Array<Relation<Simulation_Action | Organization>>
	) {}
}
