class Generic_Fact {
	constructor(
		private name: string,
		private description: string,
		private impact: Array<Relation<Generic_Fact | Simulation_Action | Organization>>
	) {}
}
