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
			RETURN o
		`);

		console.log('result', result);

		const organisations = result.records.map((record) => {
			const props = record.get('o').properties;
			console.log('props', props);
			return {
				name: props.name,
				description: props.description,
				type: props.type,
				objective: props.objective,
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
					material: []
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
