import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';

export const RelationConnexionSchema = z.object({
	SourceProperty: z.string().describe('The property of the source that is the source of the link'),
	TargetProperty: z.string().describe('The property of the target that is the target of the link'),
	impact: z.number().describe('The level of relation between the source and the target')
});

export const RelationSchema = z.object({
	type: z.literal('relation').default('relation').describe('The type of relation'),
	name: TranslationSchema.describe('The name of the relation'),
	description: TranslationSchema.describe('The description of the relation'),
	Element1ID: z.uuid().describe('The UUID of element 1 from the existing simulation elements'),
	Element1Type: z.enum([
		'organization',
		'fact',
		'action',
		'person',
		'interest_group',
		'event',
		'evolution',
		'ranking',
		'material_resource'
	]),
	Element2ID: z.uuid().describe('The UUID of element 2 from the existing simulation elements'),
	Element2Type: z.enum([
		'organization',
		'fact',
		'action',
		'person',
		'interest_group',
		'event',
		'evolution',
		'ranking',
		'material_resource'
	]),
	element1_element2_connexions: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Connexions from element 1 to element 2'),
	element2_element1_connexions: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Connexions from element 2 to element 1'),
	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility that the relation happen. This number will after normalize the probability distribution.'
		),

	probability_distribution: z
		.string()
		.describe(
			'The probability distribution of the relation happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the relation happen. Give the expression of the function that describe the probability distribution.'
		),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the relation compared with other relations. Its for avoid that people spam same thing and increase the probability of certain things.'
		)
});

export type RelationData = z.infer<typeof RelationSchema>;

export interface RelationSvgShapeOptions extends SvgShapeOptions {
	sourceX?: number;
	sourceY?: number;
	targetX?: number;
	targetY?: number;
}

export const ProofRelationConnexionSchema = z.object({
	SourceProperty: z.string().describe('The property of the source that is the source of the link'),
	impact: z.number().describe('The level of relation between the source and the target')
});

export const ProofRelationSchema = z.object({
	type: z
		.literal('proof_relation')
		.default('proof_relation')
		.describe('The type of proof relation'),
	name: TranslationSchema.describe('The name of the relation'),
	description: TranslationSchema.describe('The description of the relation'),
	SourceID: z.string().describe('The ID of element that are the source of the link'),
	SourceType: z.enum([
		'organization',
		'fact',
		'action',
		'person',
		'interest_group',
		'event',
		'evolution',
		'ranking',
		'material_resource'
	]),
	TargetID: z.string().describe('The ID of element that are the target of the link'),
	connexions: z.array(RelationConnexionSchema).default([]).describe('Connexions of the relation')
});

export type ProofRelationData = z.infer<typeof ProofRelationSchema>;

/**
 * Relation SVG shape
 */
export function svg_shape(relation: RelationData, options: RelationSvgShapeOptions = {}): string {
	const { sourceX, sourceY, targetX, targetY, color = '#4ef838', locale = 'fr' } = options;

	if (
		![sourceX, sourceY, targetX, targetY].every(
			(coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)
		)
	) {
		return '';
	}

	let label = 'Relation';
	if (relation.name && typeof relation.name === 'object') {
		label = relation.name[locale] || relation.name.fr || relation.name.en || 'Relation';
	} else if (typeof relation.name === 'string') {
		label = relation.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;
	const labelX = (sourceX! + targetX!) / 2;
	const labelY = (sourceY! + targetY!) / 2;

	return `
		<g
			class="fact-node relation-node"
			data-type="relation"
		>
			<line
				x1="${sourceX}"
				y1="${sourceY}"
				x2="${targetX}"
				y2="${targetY}"
				stroke="${color}"
				stroke-opacity="0.24"
				stroke-width="9"
				stroke-linecap="round"
				pointer-events="none"
			/>
			<line
				x1="${sourceX}"
				y1="${sourceY}"
				x2="${targetX}"
				y2="${targetY}"
				stroke="${color}"
				stroke-width="3"
				stroke-linecap="round"
			/>
			
		</g>
	`.trim();
}
