'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating an executive summary of a report.
 *
 * generateExecutiveSummary - A function that generates an executive summary.
 * GenerateExecutiveSummaryInput - The input type for the generateExecutiveSummary function.
 * GenerateExecutiveSummaryOutput - The output type for the generateExecutiveSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateExecutiveSummaryInputSchema = z.object({
  reportData: z
    .string()
    .describe('The data from the report to be summarized.'),
});
export type GenerateExecutiveSummaryInput = z.infer<
  typeof GenerateExecutiveSummaryInputSchema
>;

const GenerateExecutiveSummaryOutputSchema = z.object({
  executiveSummary: z
    .string()
    .describe(
      'A concise executive summary of the report, including key trends and strategic suggestions.'
    ),
});
export type GenerateExecutiveSummaryOutput = z.infer<
  typeof GenerateExecutiveSummaryOutputSchema
>;

export async function generateExecutiveSummary(
  input: GenerateExecutiveSummaryInput
): Promise<GenerateExecutiveSummaryOutput> {
  return generateExecutiveSummaryFlow(input);
}

const generateExecutiveSummaryPrompt = ai.definePrompt({
  name: 'generateExecutiveSummaryPrompt',
  input: {schema: GenerateExecutiveSummaryInputSchema},
  output: {schema: GenerateExecutiveSummaryOutputSchema},
  prompt: `You are an AI assistant that generates executive summaries for reports.

  Given the following report data, create a concise executive summary that highlights key trends and provides strategic suggestions for leadership.

  Report Data: {{{reportData}}}
  `,
});

const generateExecutiveSummaryFlow = ai.defineFlow(
  {
    name: 'generateExecutiveSummaryFlow',
    inputSchema: GenerateExecutiveSummaryInputSchema,
    outputSchema: GenerateExecutiveSummaryOutputSchema,
  },
  async input => {
    const {output} = await generateExecutiveSummaryPrompt(input);
    return output!;
  }
);
