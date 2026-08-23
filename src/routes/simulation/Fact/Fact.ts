import type { MathNode } from 'mathjs';

class Fact extends Generic_Fact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<Generic_Fact | Simulation_Action | Organization>>,
		private probability: MathNode
	) {
        super(name, description, impact)
    }
}
