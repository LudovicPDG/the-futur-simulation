import type { MathNode } from 'mathjs';

export default class Prediction {
	constructor(
		private name: string,
		private description: string,
		private probability: MathNode
	) {}
}
