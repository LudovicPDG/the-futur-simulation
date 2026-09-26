import type { SimulationElement } from '$lib/stores/simulation';
import type { SvgShapeOptions } from '$lib/simulation/fact';
import { svg_shape as fact_svg_shape } from '$lib/simulation/fact';
import { svg_shape as person_svg_shape } from '$lib/simulation/character/Person';
import { svg_shape as organization_svg_shape } from '$lib/simulation/character/Organization';
import { svg_shape as interest_group_svg_shape } from '$lib/simulation/character/Interest_group';
import { svg_shape as character_svg_shape } from '$lib/simulation/character/Character';
import { svg_shape as event_svg_shape } from '$lib/simulation/event/event';
import { svg_shape as evolution_svg_shape } from '$lib/simulation/event/Evolution';
import { svg_shape as ranking_svg_shape } from '$lib/simulation/event/Ranking';
import { svg_shape as action_svg_shape } from '$lib/simulation/Action';
import { svg_shape as material_resource_svg_shape } from '$lib/simulation/Material_resouce';
import { svg_shape as proof_svg_shape } from '$lib/simulation/Proof';
import { svg_shape as relation_svg_shape } from '$lib/simulation/Relation';

export function renderSimulationElementSvg(
	element: SimulationElement,
	options: SvgShapeOptions = {}
): string {
	const type = element.type || 'fact';

	switch (type) {
		case 'person':
			return person_svg_shape(element as any, options);
		case 'organization':
			return organization_svg_shape(element as any, options);
		case 'interest_group':
			return interest_group_svg_shape(element as any, options);
		case 'character':
			return character_svg_shape(element as any, options);
		case 'evolution':
			return evolution_svg_shape(element as any, options);
		case 'ranking':
			return ranking_svg_shape(element as any, options);
		case 'event':
			return event_svg_shape(element as any, options);
		case 'action':
			return action_svg_shape(element as any, options);
		case 'material_resource':
			return material_resource_svg_shape(element as any, options);
		case 'proof':
			return proof_svg_shape(element as any, options);
		case 'relation':
			return relation_svg_shape(element as any, options);
		case 'fact':
		default:
			return fact_svg_shape(element as any, options);
	}
}
