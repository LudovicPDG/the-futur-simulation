import { z } from 'zod';

export const TranslationSchema = z.object({
	fr: z.string().describe('French translation'),
	en: z.string().describe('English translation'),
	de: z.string().describe('German translation'),
	es: z.string().describe('Spanish translation')
});

export type TranslationData = z.infer<typeof TranslationSchema>;

export function parseTranslation(value: unknown): TranslationData | undefined {
	if (typeof value !== 'string') return undefined;

	const input = value.trim();
	if (!input.startsWith('(') || !input.endsWith(')')) return undefined;

	const fields: string[] = [];
	let field = '';
	let quoted = false;
	const composite = input.slice(1, -1);

	for (let index = 0; index < composite.length; index++) {
		const character = composite[index];

		if (character === '"') {
			if (quoted && composite[index + 1] === '"') {
				field += '"';
				index++;
			} else {
				quoted = !quoted;
			}
		} else if (character === '\\' && quoted && index + 1 < composite.length) {
			field += composite[++index];
		} else if (character === ',' && !quoted) {
			fields.push(field === 'NULL' ? '' : field);
			field = '';
		} else {
			field += character;
		}
	}

	if (quoted) return undefined;
	fields.push(field === 'NULL' ? '' : field);
	if (fields.length !== 4) return undefined;

	return { fr: fields[0], en: fields[1], de: fields[2], es: fields[3] };
}
