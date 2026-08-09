import { Ressource, Right } from './Character';
import Organization from './Organization';
import type { Member } from './Organization';

export default class Interest_group extends Organization {
	constructor(
		members: Set<Member>,
		member_number: number,
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
		super(
			members,
			member_number,
			ID,
			name,
			description,
			type,
			capital,
			revenue,
			expenses,
			satisfaction,
			other,
			rights
		);
	}
}
