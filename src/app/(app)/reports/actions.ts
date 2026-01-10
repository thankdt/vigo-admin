'use server';

import { generateExecutiveSummary } from '@/ai/flows/generate-executive-summary';

export async function getExecutiveSummaryAction(reportData: string) {
  try {
    const result = await generateExecutiveSummary({ reportData });
    return { summary: result.executiveSummary, error: null };
  } catch (e) {
    console.error(e);
    // In a real app, you'd want to log this error more robustly
    return { summary: null, error: 'An error occurred while generating the summary. Please try again.' };
  }
}
