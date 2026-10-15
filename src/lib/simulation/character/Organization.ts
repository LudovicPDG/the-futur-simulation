import { z } from 'zod';
import { EvolutionTypeSchema } from '../event/Evolution';
import { CharacterSchema, character_svg_shape } from './Character';
import type { SvgShapeOptions } from '../fact';
import { ProbabilityDistributionSchema } from '../ProbabilityDistribution';

export const OrganizationSchema = CharacterSchema.extend({
	type: z.literal('organization').default('organization').describe('The type of organization'),
	start_probability_distribution: ProbabilityDistributionSchema.describe(
		'START of the existence of the organization = its CREATION (legal foundation, official birth): the date, hour and minute of the foundation. Give the exact moment (year, month, day, hour, minute) of the event: it becomes the center of the distribution. Use a very small omega when the moment is documented.'
	),
	end_probability_distribution: ProbabilityDistributionSchema.describe(
		'END of the existence of the organization = its DISSOLUTION (closure, bankruptcy, merger, collapse). If it is not planned, estimate it with a large omega. Give the exact moment (year, month, day, hour, minute) of the event if it is known or planned (otherwise your best estimate, with a larger omega): it becomes the center of the distribution.'
	),
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
