import { OrganizationSchema } from './Organization';
import { z } from 'zod';
import { EvolutionTypeSchema } from '../event/Evolution';
import { TranslationSchema } from '../Translation';
import { character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';
import { existenceSchema } from '../Existence';

export const InterestGroupSchema = OrganizationSchema.extend({
	type: z
		.literal('interest_group')
		.default('interest_group')
		.describe('The type of interest group'),
	existence: existenceSchema(
		'interest group',
		'The existence starts at its EMERGENCE (the moment when this shared interest became a visible, identifiable movement: a founding event, a first manifestation, a publication) and ends at its DISAPPEARANCE (goal reached, dissolution, loss of all its supporters); if it is not foreseeable, make the end a slow decline.'
	),
	willing: z.array(TranslationSchema).describe('list of what this person is willing to do'),
	satisfaction: EvolutionTypeSchema.describe(
		'Satisfaction of the person, based on the realization or no of this willing.'
	)
});

export type InterestGroupData = z.infer<typeof InterestGroupSchema>;

/**
 * Interest Group SVG Shape:
 * Character base circle + heart symbol above title
 */
export function svg_shape(group: InterestGroupData, options: SvgShapeOptions = {}): string {
	const heartIcon = `
		<g class="symbol interest-group-symbol" transform="translate(-10, -26)">
			<path
				d="M 10 17 L 3 10 C 0.5 7.5, 2 3, 5.5 3 C 7.5 3, 9 4.5, 10 6 C 11 4.5, 12.5 3, 14.5 3 C 18 3, 19.5 7.5, 17 10 Z"
				fill="#000000ff"
			/>
		</g>
	`;
	return character_svg_shape(group, { color: '#ec4848ff', ...options }, heartIcon);
}
