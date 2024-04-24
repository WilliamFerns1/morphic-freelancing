import { DeepPartial } from 'ai'
import { z } from 'zod'

// search_query,
// max_results,


export const searchSchema = z.object({
  keywords: z
    .array(z.string())
    .describe('An array of strings, with keywords for the product/s the user is looking for, for example: ["tv", "55 inch", "4k", ...]'),
  max_results: z
    .number()
    .max(20)
    .default(5)
    .describe('The maximum number of product results to return'),
})

export type PartialInquiry = DeepPartial<typeof searchSchema>
