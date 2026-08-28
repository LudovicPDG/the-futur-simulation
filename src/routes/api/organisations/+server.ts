import { json } from '@sveltejs/kit';
import neo4j from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
	const session = driver.session();

	try {
		const result = await session.run(`
			MATCH (o:Organisation)
			OPTIONAL MATCH (o)-[:HAS_RESOURCE]->(r:MaterialResource)
			RETURN o, collect(r) AS materialResources
		`);

		console.log('result', result);

		const organisations = result.records.map((record) => {
			const props = record.get('o').properties;
			const materialResources = record.get('materialResources') as Array<{
				properties: Record<string, unknown>;
			}>;
			console.log('props', props);
			const name_fr = props.name_fr ?? props.name ?? '';
			const name_en = props.name_en ?? props.name ?? '';
			const name_de = props.name_de ?? props.name ?? '';
			const name_es = props.name_es ?? props.name ?? '';
			const description_fr = props.description_fr ?? props.description ?? '';
			const description_en = props.description_en ?? props.description ?? '';
			const description_de = props.description_de ?? props.description ?? '';
			const description_es = props.description_es ?? props.description ?? '';
			const type_fr = props.type_fr ?? props.type ?? '';
			const type_en = props.type_en ?? props.type ?? '';
			const type_de = props.type_de ?? props.type ?? '';
			const type_es = props.type_es ?? props.type ?? '';
			const objective_fr = props.objective_fr ?? props.objective ?? [];
			const objective_en = props.objective_en ?? props.objective ?? [];
			const objective_de = props.objective_de ?? props.objective ?? [];
			const objective_es = props.objective_es ?? props.objective ?? [];

			return {
				name: name_fr || name_en || name_de || name_es,
				description: description_fr || description_en || description_de || description_es,
				type: type_fr || type_en || type_de || type_es,
				objective: objective_fr.length
					? objective_fr
					: objective_en.length
						? objective_en
						: objective_de.length
							? objective_de
							: objective_es,
				name_fr,
				name_en,
				name_de,
				name_es,
				description_fr,
				description_en,
				description_de,
				description_es,
				type_fr,
				type_en,
				type_de,
				type_es,
				objective_fr,
				objective_en,
				objective_de,
				objective_es,
				satisfaction:
					typeof props.satisfaction === 'object' &&
					props.satisfaction !== null &&
					'toNumber' in props.satisfaction
						? (props.satisfaction as { toNumber: () => number }).toNumber()
						: Number(props.satisfaction ?? 50),
				resource: {
					human:
						typeof props.human_resource === 'object' &&
						props.human_resource !== null &&
						'toNumber' in props.human_resource
							? (props.human_resource as { toNumber: () => number }).toNumber()
							: Number(props.human_resource ?? 1),
					financial:
						typeof props.financial_resource === 'object' &&
						props.financial_resource !== null &&
						'toNumber' in props.financial_resource
							? (props.financial_resource as { toNumber: () => number }).toNumber()
							: Number(props.financial_resource ?? 0),
					material: materialResources
						.filter((resource) => resource !== null)
						.map((resource) => {
							const material = resource.properties;
							const toNumber = (value: unknown) =>
								typeof value === 'object' && value !== null && 'toNumber' in value
									? (value as { toNumber: () => number }).toNumber()
									: Number(value ?? 0);

							return {
								name: String(material.name_fr ?? material.name_en ?? ''),
								name_fr: String(material.name_fr ?? ''),
								name_en: String(material.name_en ?? ''),
								name_de: String(material.name_de ?? ''),
								name_es: String(material.name_es ?? ''),
								description_fr: String(material.description_fr ?? ''),
								description_en: String(material.description_en ?? ''),
								description_de: String(material.description_de ?? ''),
								description_es: String(material.description_es ?? ''),
								quantity: toNumber(material.quantity),
								value: toNumber(material.value)
							};
						})
				}
			};
		});

		return json({ organisations });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Failed to fetch organisations';
		console.error('Error fetching organisations from Neo4j:', error);
		return json({ error: message, organisations: [] }, { status: 500 });
	} finally {
		await session.close();
		await driver.close();
	}
};
