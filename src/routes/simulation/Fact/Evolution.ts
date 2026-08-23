class Evolution extends Generic_Fact {
	constructor(
		name: string,
		description: string,
		impact: Array<Relation<Generic_Fact | Simulation_Action | Organization>>,
		evolution: MathNode,
		unit: string,
		probability: number
	) {
		super(name, description, impact);
	}
}
