class Classement extends Generic_Fact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<Generic_Fact | Simulation_Action | Organization>>,
		private probability: number,
		private ranking: Array<Rank>
	) {
		super(name, description, impact);
	}
}

class Rank {
	constructor(
		private name: string,
		private description: string,
		private value: number,
		private unit: string
	) {}
}
