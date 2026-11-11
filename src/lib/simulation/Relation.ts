import { z } from 'zod';
import { TranslationSchema } from './Translation';
import type { SvgShapeOptions } from './fact';
import { existenceSchema, impactSchema, peopleImpactedSchema } from './Existence';

/**
 * How the value of the source property gives an estimate of the target property (see RelationInfluence). Flat on
 * purpose, so that the genie can write it with strict structured outputs.
 */
export const RelationEstimateSchema = z.object({
	kind: z
		.enum(['proportional', 'additive', 'inverse', 'points'])
		.describe(
			'proportional: estimate = parameter * source value ("each unit of the source gives 2 units of the target", parameter 2). additive: estimate = source value + parameter ("adds 5"). inverse: estimate = parameter / source value (the more the source, the less the target). points: the estimate goes through the given points (any other shape, e.g. a saturation).'
		),
	parameter: z
		.number()
		.describe('The factor (proportional), the offset (additive) or the constant (inverse). 0 and ignored for points.'),
	points: z
		.array(
			z.object({
				source_value: z.number().describe('A value of the source property'),
				estimated_value: z.number().describe('The value of the target property that the relation estimates from it')
			})
		)
		.describe('Only for kind "points": at least two points; an empty list for any other kind.')
});

export type RelationEstimateData = z.infer<typeof RelationEstimateSchema>;

export const RelationConnexionSchema = z.object({
	Element1Property: z.string().describe('The property of element 1 in this relation'),
	Element2Property: z.string().describe('The property of element 2 in this relation'),
	impact: z.number().describe('The strength of the relation between these properties'),
	estimate: RelationEstimateSchema.optional().describe(
		'The estimate of the target value that the relation gives from the source value. Where the two values are consistent, it gives the current target value.'
	)
});

export type RelationConnexionData = z.infer<typeof RelationConnexionSchema>;

export const RelationElementTypeSchema = z.enum([
	'organization',
	'fact',
	'action',
	'person',
	'interest_group',
	'event',
	'evolution',
	'ranking',
	'material_resource'
]);

export const RelationSchema = z.object({
	type: z.literal('relation').default('relation').describe('The type of relation'),
	name: TranslationSchema.describe('The name of the relation'),
	description: TranslationSchema.describe('The description of the relation'),
	Element1ID: z.uuid().describe('The UUID of element 1 from the existing simulation elements'),
	Element1Type: RelationElementTypeSchema,
	Element2ID: z.uuid().describe('The UUID of element 2 from the existing simulation elements'),
	Element2Type: RelationElementTypeSchema,
	element1_element2_value_to_modify: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Existing values modified, from element 1 to element 2: existing property, modified property, impact'),
	element2_element1_value_to_modify: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Existing values modified, from element 2 to element 1: existing property, modified property, impact'),
	symmetric_value_to_modify: z
		.array(RelationConnexionSchema)
		.default([])
		.describe(
			'SYMMETRIC relation, the same from element 1 to element 2 and from element 2 to element 1. Existing values modified: property of element 1, property of element 2, impact. Only for effects that really work both ways.'
		),
	existence: existenceSchema('relation'),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the relation compared with other relations, as a percentage from 0 to 100 (NOT a ratio between 0 and 1): 0 = a copy of something that already exists, 50 = moderately original, 100 = completely new. Use the whole scale, e.g. 35 or 80, never 0.35 or 0.8. It avoids that people spam the same thing and increase the probability of certain things.'
		),
	impact: impactSchema('relation'),
	people_impacted: peopleImpactedSchema('relation')
});

/** The lists of a relation to which the user can ask the genie to add an entry. */
export const RELATION_LIST_FIELDS = [
	'symmetric_value_to_modify',
	'element1_element2_value_to_modify',
	'element2_element1_value_to_modify'
] as const;
export type RelationListField = (typeof RELATION_LIST_FIELDS)[number];

export type RelationData = z.infer<typeof RelationSchema> & { id?: string };

/**
 * Every value of a relation that has its own value parameters (proofs, veracity, originality): the impact of each value
 * to modify. "name" is the value_name that its proofs use.
 */
export function relationValues(
	relation: Partial<RelationData>
): { name: string; value: number | string | boolean }[] {
	const sides = [
		['symmetric', relation.symmetric_value_to_modify],
		['element1_element2', relation.element1_element2_value_to_modify],
		['element2_element1', relation.element2_element1_value_to_modify]
	] as const;
	return sides.flatMap(([direction, toModify]) =>
		(toModify ?? []).map((c) => ({ name: relationValueName(direction, c), value: c.impact }))
	);
}

/** The value_name of one value to modify of a relation. */
export function relationValueName(
	direction: 'symmetric' | 'element1_element2' | 'element2_element1',
	connexion: RelationConnexionData
): string {
	return `${direction}_value_to_modify: ${connexion.Element1Property} → ${connexion.Element2Property}`;
}

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
	SourceType: z.enum([...RelationElementTypeSchema.options]),
	TargetID: z.string().describe('The ID of element that are the target of the link'),
	connexions: z
		.array(ProofRelationConnexionSchema)
		.default([])
		.describe('Connexions of the relation')
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
