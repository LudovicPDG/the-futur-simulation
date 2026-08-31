import { OPENROUTER_API_KEY } from '$env/static/private';
import z from 'zod';
import { Organisation, OrganisationSchema } from './Organisation';
import { Proof, ProofSchema, type ProofData } from './Proof';
import neo4j from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';

const ActionSchema = z.object({
	action: z.enum([
		'create_organisation',
		'create_person',
		'create_event',
		'delete_organisation',
		'delete_person',
		'delete_event',
		'modify_organisation',
		'modify_person',
		'modify_event',
		'create_proof',
		'add_argument',
		'add_counter_argument',
		'no_action'
	]),
	targetId: z.string().default(''),
	targetField: z.string().default('')
});

const ProofGenerationSchema = z.object({
	name_fr: z.string(),
	name_en: z.string(),
	name_de: z.string(),
	name_es: z.string(),
	description_fr: z.string(),
	description_en: z.string(),
	description_de: z.string(),
	description_es: z.string(),
	value: z
		.number()
		.describe('Delta value or suggested numeric change (e.g. +10, -5) or 0 if qualitative'),
	targetField: z
		.string()
		.describe('Target field e.g. satisfaction, human, financial, description, etc.'),
	source: z.array(z.string()).describe('List of references, URLs or sources'),
	credibility: z
		.number()
		.min(0)
		.max(100)
		.describe('Credibility score between 0 and 100 based on plausibility and sources'),
	impact: z
		.number()
		.describe('Impact score, positive or negative (e.g. between -1.0 and 1.0, or absolute scale)')
});

const SimilarityCheckSchema = z.object({
	isDuplicate: z.boolean(),
	similarityScore: z.number().min(0).max(1),
	reason: z.string()
});

const NonNumericUpdateSchema = z.object({
	updatedText_fr: z.string(),
	updatedText_en: z.string(),
	updatedText_de: z.string(),
	updatedText_es: z.string()
});

export class Genie {
	private system_prompt: string = `
We are in a simulation designed to predict possible futures. The simulation is composed of three interconnected elements: facts, actions, and organizations.

You play the role of the Genius. Your task is to create and manage these elements by assigning them accurate information and appropriate values based on the information available to you.

Everything in the simulation is **modifiable**. Users can challenge or contradict elements you have created by providing new information or evidence. You must evaluate this evidence and, when justified, update the relevant elements and their values.

Everything in the simulation is interconnected:

Everything in the simulation can be interconnected. Facts, actions, and organizations can be linked to one another, allowing information, influence, and changes to propagate throughout the simulation.

The only restriction is that an organization cannot directly influence or modify a fact. An organization must first act by creating or carrying out an action. The action then provides the mechanism through which the organization can influence, modify, create, or invalidate a fact.

Your role is therefore not simply to create information, but to maintain a coherent and dynamically evolving simulation.

Organizations

An organization represents a structured group of people or entities pursuing one or more objectives.

name

The name of the organization.

description

A concise description of the organization, explaining what it is, what it does, and any other relevant characteristics.

type

The type or category of the organization.

Examples include:

Government
Company
Association
NGO
Political party
Institution
International organization
Informal group

objective

An array containing the organization's objectives.

Each objective should describe something the organization is attempting to achieve. Objectives should be specific enough to evaluate whether they have been achieved.

satisfaction

The organization's overall satisfaction level, expressed as a value between 0 and 100.

Satisfaction represents the extent to which the organization has achieved its objectives.

0 means that none of the organization's objectives have been achieved.
100 means that all of the organization's objectives have been achieved.
Values between 0 and 100 represent partial achievement.

The satisfaction value should therefore reflect the organization's current level of objective fulfillment.

resource

The resources available to the organization.

Resources are divided into three categories: human, material, and financial.

resource.human

The organization's human resources, represented by the number of people working for or available to the organization.

For example, an organization employing 500 people has:

human: 500

resource.material

An array containing the organization's material resources.

Each material resource must contain:

name: the name of the resource.
description: a description of the resource.
quantity: the quantity available.
value: the estimated value of each unit or the relevant value assigned to the resource.

Material resources can include physical assets such as buildings, vehicles, machinery, equipment, infrastructure, or other tangible goods.

resource.financial

The organization's financial resources, represented by the amount of money or financial capital available to the organization.

all the texts must be in french (_fr), english (_en), german (_de) and spanish (_es).

Everything in the simulation is **modifiable**. Users can challenge or contradict elements you have created by providing new information, arguments, counter-arguments or evidence (Proofs).

The Genius CANNOT directly modify an element out of nowhere: it must be backed by a Proof created by a user or the Genius.

Mathematical rule for numeric fields:
If a Proof targets a numeric value (e.g. satisfaction, human resources, financial resources, etc.), the change is calculated mathematically:
final_value = initial_value + (proof_value * proof_impact * (proof_credibility / 100))

For non-numeric fields (such as descriptions or qualitative attributes), the Genius is invoked with the current text, the proof details, its impact and credibility to synthesize an updated text reflecting the proof.

Proofs have a tree structure:
- A Proof can be attached to an Organisation, a Fact or an Action.
- Other users/agents can add Arguments (supporting) or Counter-Arguments (opposing) to any Proof.
- Arguments/Counter-arguments influence the parent proof's credibility and impact, propagating up to the main element.

Spam prevention rules:
- Any proof with negligible credibility (<10) or negligible impact (<0.05) must be rejected.
- Before creating a proof, the Genius checks if a similar proof already exists on this target to prevent redundant spamming.

All text fields in the simulation must be provided in four languages: French (_fr), English (_en), German (_de), and Spanish (_es).
`;

	constructor(
		private model_name: string = 'openai/gpt-5.6-luna',
		private level_of_reasoning: string = 'low'
	) {}

	async ask(question: string) {
		console.log('Genie prompt:', question);
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: this.system_prompt },
					{ role: 'user', content: question }
				],
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'simulation_action',
						strict: true,
						schema: z.toJSONSchema(ActionSchema)
					}
				}
			})
		});

		const data = await response.json();
		console.log('OpenRouter ask response:', data);

		if (!response.ok || data.error) {
			console.error('OpenRouter API error in ask():', data.error || data);
			throw new Error(`OpenRouter API error: ${JSON.stringify(data.error || data)}`);
		}

		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			console.error('OpenRouter returned empty content. Full response:', JSON.stringify(data, null, 2));
			throw new Error('OpenRouter returned an empty response');
		}

		let json: unknown;
		try {
			json = JSON.parse(content);
		} catch {
			throw new Error('OpenRouter returned invalid JSON');
		}

		const actionResult = ActionSchema.parse(json);
		console.log('Action parsed:', actionResult);

		switch (actionResult.action) {
			case 'create_organisation': {
				const org = await this.createOrganisation(question);
				return { action: actionResult.action, organisation: org.data };
			}
			case 'create_proof':
			case 'add_argument':
			case 'add_counter_argument': {
				const relType =
					actionResult.action === 'add_argument'
						? 'HAS_ARGUMENT'
						: actionResult.action === 'add_counter_argument'
							? 'HAS_COUNTER_ARGUMENT'
							: 'TARGETS';

				const proofResult = await this.processProofSubmission(
					question,
					actionResult.targetId,
					relType,
					actionResult.targetField
				);
				return { action: actionResult.action, ...proofResult };
			}
			default:
				return { action: actionResult.action, organisation: null };
		}
	}

	async checkSimilarity(
		targetId: string,
		candidateDescription: string
	): Promise<{ isDuplicate: boolean; reason: string }> {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
		const session = driver.session();

		try {
			// Fetch existing proofs for the target
			const res = await session.run(
				`
				MATCH (t)-[:HAS_PROOF|HAS_ARGUMENT|HAS_COUNTER_ARGUMENT]->(p:Proof)
				WHERE elementId(t) = $targetId OR t.name_fr = $targetId OR t.name_en = $targetId OR t.name = $targetId
				RETURN p.name_fr AS name, p.description_fr AS desc
				LIMIT 10
				`,
				{ targetId }
			);

			const existingProofs = res.records.map((r) => `${r.get('name')}: ${r.get('desc')}`);
			if (existingProofs.length === 0) {
				return { isDuplicate: false, reason: 'No existing proofs to compare with.' };
			}

			const prompt = `Compare this new candidate proof against existing proofs on this target.
Existing proofs:
${existingProofs.map((p, i) => `${i + 1}. ${p}`).join('\n')}

New candidate proof:
${candidateDescription}

Is this candidate an exact or essentially identical duplicate of an existing proof? (Spam duplicate check)`;

			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${OPENROUTER_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: this.model_name,
					messages: [
						{ role: 'system', content: 'You are an objective duplicate/similarity evaluator.' },
						{ role: 'user', content: prompt }
					],
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: 'similarity_check',
							strict: true,
							schema: z.toJSONSchema(SimilarityCheckSchema)
						}
					}
				})
			});

			const data = await response.json();
			const content = data.choices?.[0]?.message?.content;
			if (!content) return { isDuplicate: false, reason: 'Unable to evaluate similarity.' };

			const parsed = SimilarityCheckSchema.parse(JSON.parse(content));
			return {
				isDuplicate: parsed.isDuplicate || parsed.similarityScore > 0.85,
				reason: parsed.reason
			};
		} catch (err) {
			console.error('Similarity check error:', err);
			return { isDuplicate: false, reason: 'Similarity check bypassed.' };
		} finally {
			await session.close();
			await driver.close();
		}
	}

	async processProofSubmission(
		userPrompt: string,
		targetId?: string,
		relType: 'TARGETS' | 'HAS_ARGUMENT' | 'HAS_COUNTER_ARGUMENT' = 'TARGETS',
		targetField?: string
	) {
		// 1. Generate structured proof in 4 languages
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: this.system_prompt },
					{
						role: 'user',
						content: `Generate a structured proof/argument from this user input: "${userPrompt}". Target: "${targetId || 'general'}", field: "${targetField || 'satisfaction'}". Ensure credible scoring (credibility 0-100, impact non-zero).`
					}
				],
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'proof_generation',
						strict: true,
						schema: z.toJSONSchema(ProofGenerationSchema)
					}
				}
			})
		});

		const data = await response.json();
		if (!response.ok || data.error) {
			console.error('OpenRouter API error in processProofSubmission():', data.error || data);
			throw new Error(`OpenRouter API error in proof generation: ${JSON.stringify(data.error || data)}`);
		}
		const content = data.choices?.[0]?.message?.content;
		if (!content) throw new Error('Failed to generate proof structure from Genie (empty content)');

		const generated = ProofGenerationSchema.parse(JSON.parse(content));

		// 2. Similarity / Spam check
		if (targetId) {
			const similarity = await this.checkSimilarity(targetId, generated.description_fr);
			if (similarity.isDuplicate) {
				throw new Error(`Proof rejected as duplicate / redundant: ${similarity.reason}`);
			}
		}

		// 3. Save Proof to Neo4j
		const proof = await Proof.init(
			{
				...generated,
				targetField: targetField || generated.targetField,
				targetId
			},
			targetId,
			relType
		);

		// 4. Apply modification to target if numeric or non-numeric
		let modificationResult: Record<string, unknown> | null = null;
		if (targetId) {
			modificationResult = await this.applyProofModification(targetId, proof.data);
		}

		return { proof: proof.data, modificationResult };
	}

	async applyProofModification(targetId: string, proofData: ProofData) {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
		const session = driver.session();

		try {
			// Check if target is an Organisation
			const orgRes = await session.run(
				`
				MATCH (o:Organisation)
				WHERE elementId(o) = $targetId OR o.name_fr = $targetId OR o.name_en = $targetId OR o.name = $targetId
				RETURN o, elementId(o) AS orgId
				`,
				{ targetId }
			);

			if (orgRes.records.length > 0) {
				const orgProps = orgRes.records[0].get('o').properties;
				const field = proofData.targetField || 'satisfaction';

				// Numeric fields: satisfaction, human_resource, financial_resource
				if (
					field === 'satisfaction' ||
					field === 'human' ||
					field === 'financial' ||
					field === 'human_resource' ||
					field === 'financial_resource'
				) {
					const propKey =
						field === 'human'
							? 'human_resource'
							: field === 'financial'
								? 'financial_resource'
								: 'satisfaction';
					const currentVal = Number(orgProps[propKey] ?? (propKey === 'satisfaction' ? 50 : 0));
					const delta = proofData.value ?? 10;
					let newVal = Proof.computeNumericModification(
						currentVal,
						delta,
						proofData.impact,
						proofData.credibility
					);
					if (propKey === 'satisfaction') {
						newVal = Math.max(0, Math.min(100, Math.round(newVal)));
					} else {
						newVal = Math.max(0, Math.round(newVal));
					}

					await session.run(
						`
						MATCH (o:Organisation)
						WHERE elementId(o) = $orgId
						SET o.${propKey} = $newVal
						RETURN o
						`,
						{ orgId: orgRes.records[0].get('orgId'), newVal }
					);

					return { modifiedField: propKey, previousValue: currentVal, newValue: newVal };
				} else {
					// Non-numeric field (e.g. description)
					const updatedTexts = await this.synthesizeNonNumericText(
						String(orgProps.description_fr || ''),
						proofData
					);

					await session.run(
						`
						MATCH (o:Organisation)
						WHERE elementId(o) = $orgId
						SET o.description_fr = $fr,
						    o.description_en = $en,
						    o.description_de = $de,
						    o.description_es = $es
						RETURN o
						`,
						{
							orgId: orgRes.records[0].get('orgId'),
							fr: updatedTexts.updatedText_fr,
							en: updatedTexts.updatedText_en,
							de: updatedTexts.updatedText_de,
							es: updatedTexts.updatedText_es
						}
					);

					return { modifiedField: 'description', updatedTexts };
				}
			}

			return null;
		} finally {
			await session.close();
			await driver.close();
		}
	}

	async synthesizeNonNumericText(currentText: string, proofData: ProofData) {
		const prompt = `Current description: "${currentText}"
New Proof: "${proofData.name_fr} - ${proofData.description_fr}"
Credibility: ${proofData.credibility}/100, Impact: ${proofData.impact}

Update and integrate the new findings from this proof into the description in all 4 languages (French, English, German, Spanish).`;

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: this.system_prompt },
					{ role: 'user', content: prompt }
				],
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'non_numeric_update',
						strict: true,
						schema: z.toJSONSchema(NonNumericUpdateSchema)
					}
				}
			})
		});

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			return {
				updatedText_fr: currentText,
				updatedText_en: currentText,
				updatedText_de: currentText,
				updatedText_es: currentText
			};
		}

		return NonNumericUpdateSchema.parse(JSON.parse(content));
	}

	async createOrganisation(question: string) {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: this.system_prompt },
					{ role: 'user', content: question }
				],
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'organisation',
						strict: true,
						schema: z.toJSONSchema(OrganisationSchema)
					}
				}
			})
		});

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			throw new Error('OpenRouter returned an empty response');
		}

		const organisation = OrganisationSchema.parse(JSON.parse(content));
		console.log('organisation:', organisation);

		return Organisation.init(organisation);
	}
}

export const genie = new Genie();
