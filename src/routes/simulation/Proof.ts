class Proof<T> {
	constructor(
		private name: string,
		private description: string,
		private source: Array<string>,
		private value: T,
		private probabilty: number,
		private impact: number,
		private proof: Proof<T>
	) {}
}
