import { z } from 'zod';

/**
 * The JSON schema the genie must follow, for strict structured outputs. It describes what the genie writes (the input
 * of the schema: the interpolation points, before they become functions), with every property required and no other
 * property allowed, as strict mode requires.
 */
export function toStrictJSONSchema(schema: z.ZodType): Record<string, unknown> {
	const strict = (node: unknown): void => {
		if (Array.isArray(node)) {
			node.forEach(strict);
			return;
		}
		if (typeof node !== 'object' || node === null) return;
		const record = node as Record<string, unknown>;
		if (record.type === 'object' && typeof record.properties === 'object' && record.properties !== null) {
			record.required = Object.keys(record.properties);
			record.additionalProperties = false;
		}
		Object.values(record).forEach(strict);
	};
	const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
	strict(json);
	return json;
}
