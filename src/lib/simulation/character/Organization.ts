import { z } from 'zod';
import { EvolutionTypeSchema } from '../event/Evolution';
import { CharacterSchema, character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';

export const OrganizationSchema = CharacterSchema.extend({
	type: z.literal('organization').default('organization').describe('The type of organization'),
	human_resource: EvolutionTypeSchema.describe('Number of human that are in this organization')
});

export type OrganizationData = z.infer<typeof OrganizationSchema>;

/**
 * Organization SVG Shape:
 * Character base circle + building symbol above title
 */
export function svg_shape(organization: OrganizationData, options: SvgShapeOptions = {}): string {
	const buildingIcon = `
		<g class="symbol organization-symbol" transform="translate(-9, -30)">
			<!-- Building -->
			<rect
				x="1"
				y="1"
				width="16"
				height="21"
				rx="1"
				fill="none"
				stroke="#000000"
				stroke-width="1.7"
			/>

			<!-- Windows -->
			<rect x="4" y="5" width="3" height="3" fill="#000000" />
			<rect x="11" y="5" width="3" height="3" fill="#000000" />

			<rect x="4" y="11" width="3" height="3" fill="#000000" />
			<rect x="11" y="11" width="3" height="3" fill="#000000" />

			<!-- Entrance -->
			<rect x="7" y="16" width="4" height="6" fill="#000000" />
		</g>
	`;

	return character_svg_shape(organization, { color: '#fb4430ff', ...options }, buildingIcon);
}
