// 'use server'; // Disabled for Static Export
// import { generateExecutiveSummary } from '@/ai/flows/generate-executive-summary';

export async function getExecutiveSummaryAction(reportData: string) {
  // Client-side stub for static export
  console.log("AI Summary requested for:", reportData.length, "chars");
  return {
    summary: "AI Executive Summary is not available in Static Export mode (S3 Hosting). This feature requires a backend server.",
    error: null
  };
}
