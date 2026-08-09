import { Character, Ressource, Right } from './Character';
import type Person from './Person';

export default class Organization extends Character {
	constructor(
		private members: Set<Member>,
		private member_number: number,
		ID: number,
		name: string,
		description: string,
		type: string,
		capital: Set<Ressource>,
		revenue: Set<Ressource>,
		expenses: Set<Ressource>,
		satisfaction: number,
		other: Map<String, any>,
		rights: Set<Right>
	) {
		super(ID, name, description, type, capital, revenue, expenses, satisfaction, other, rights);
	}
}

export class Member {
	constructor(
		private ID: number,
		person: Person,
		role: string
	) {}
}
