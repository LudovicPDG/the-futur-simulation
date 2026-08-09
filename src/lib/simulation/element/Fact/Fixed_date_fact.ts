export default class Fixed_date_fact {
	constructor(
		private name: string,
		private description: string,
		private date: Date,
		private credibility: number
	) {}
}

export class Fixed_date_fact_with_values extends Fixed_date_fact {
	constructor(
		name: string,
		description: string,
		date: Date,
		credibility: number,
		private value: number,
		private unit: string
	) {
		super(name, description, date, credibility);
	}
}
