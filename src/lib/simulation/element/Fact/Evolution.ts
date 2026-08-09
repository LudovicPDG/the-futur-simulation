import type { MathNode } from 'mathjs';

export default class Evolution {
	constructor(
		private name: string,
		private description: string,
		private credibility: number,
		private formula: MathNode,
		private unit: string
	) {}
}
