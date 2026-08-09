export default class Ranking {
	constructor(
		private name: string,
		private description: string,
		private date: Date,
		private credibility: number,
		private leaderboard: Array<Ranking_element>
	) {}
}

export class Ranking_element {
	constructor(
		private name: string,
		private value: number,
		private unit: string
	) {}
}
