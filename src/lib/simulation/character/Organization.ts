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
		<g class="symbol organization-symbol" transform="translate(-11, -27)">
			<!-- Main building body -->
			<rect x="2" y="4" width="18" height="15" rx="1" fill="none" stroke="#ffffff" stroke-width="1.8" />
			<!-- Door -->
			<rect x="9" y="12" width="4" height="7" fill="#ffffff" />
			<!-- Windows -->
			<rect x="5" y="7" width="3" height="3" fill="#ffffff" />
			<rect x="14" y="7" width="3" height="3" fill="#ffffff" />
		</g>
	`;
	return character_svg_shape(organization, { color: '#3b82f6', ...options }, buildingIcon);
}
