import { z } from 'zod';

export const TranslationSchema = z.object({
	fr: z.string().describe('French translation'),
	en: z.string().describe('English translation'),
	de: z.string().describe('German translation'),
	es: z.string().describe('Spanish translation')
});

export type TranslationData = z.infer<typeof TranslationSchema>;
