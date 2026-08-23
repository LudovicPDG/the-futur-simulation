class Simulation_Action {
	constructor(
		private name: string,
		private description: string,
		private probability: number,
		private relation: Array<Fact>
	) {}
}
