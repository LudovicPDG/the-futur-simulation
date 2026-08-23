export class Relation<T> {
	constructor(
		private name: string,
		private description: string,
		private impact: string,
		private valueThatModify: string,
		private elementToModify: T,
		private valueToModify: string
	) {}
}

