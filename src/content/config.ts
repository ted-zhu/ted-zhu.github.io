import { z, defineCollection } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().default(new Date('2024-01-01')),
    updated: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z
      .array(z.string())
      .optional()
      .nullable()
      .transform((v) => v ?? []),
    categories: z
      .array(z.string())
      .optional()
      .nullable()
      .transform((v) => v ?? []),
    summary: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
