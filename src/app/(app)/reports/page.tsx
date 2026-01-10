'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import { getExecutiveSummaryAction } from './actions';
import { mockUsers } from '@/lib/data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState('');
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = React.useState(false);
  const [reportData, setReportData] = React.useState<any[] | null>(null);
  const [summary, setSummary] = React.useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerateReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportType) {
      toast({
        title: "Incomplete Form",
        description: "Please select a report type.",
        variant: "destructive",
      });
      return;
    }
    setIsGeneratingReport(true);
    setSummary(null);
    // Simulate API call
    setTimeout(() => {
      // Using mock data for demonstration
      setReportData(mockUsers);
      setIsGeneratingReport(false);
    }, 1500);
  };

  const handleGenerateSummary = async () => {
    if (!reportData) return;
    setIsGeneratingSummary(true);
    setSummary(null);

    const reportString = JSON.stringify(reportData, null, 2);
    const result = await getExecutiveSummaryAction(reportString);

    if (result.error) {
      toast({
        title: "Summary Generation Failed",
        description: result.error,
        variant: "destructive",
      });
    } else {
      setSummary(result.summary);
    }
    setIsGeneratingSummary(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Generation"
        description="Generate custom reports and AI-powered summaries."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <form onSubmit={handleGenerateReport}>
            <CardHeader>
              <CardTitle>Report Builder</CardTitle>
              <CardDescription>Select criteria to generate your report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-type">Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger id="report-type">
                    <SelectValue placeholder="Select a report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_activity">User Activity</SelectItem>
                    <SelectItem value="content_performance">Content Performance</SelectItem>
                    <SelectItem value="system_health">System Health</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Add more filters here based on report type */}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isGeneratingReport}>
                {isGeneratingReport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Report
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {reportData && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Report</CardTitle>
                <CardDescription>
                  Displaying results for the "{reportType.replace(/_/g, ' ')}" report.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.role}</TableCell>
                        <TableCell>{row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
               <CardFooter className="flex justify-end">
                <Button onClick={handleGenerateSummary} disabled={isGeneratingSummary || !reportData}>
                  {isGeneratingSummary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate Executive Summary
                </Button>
              </CardFooter>
            </Card>
          )}

          {isGeneratingSummary && (
             <Card className="flex flex-col items-center justify-center p-8 text-center">
              <Bot className="h-10 w-10 text-primary animate-bounce" />
              <p className="mt-4 font-medium">Our AI is analyzing the data...</p>
              <p className="text-sm text-muted-foreground">This may take a moment.</p>
            </Card>
          )}

          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI-Generated Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans">
                {summary}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
