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
        title: "Thiếu thông tin",
        description: "Vui lòng chọn loại báo cáo.",
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
        title: "Tạo tóm tắt thất bại",
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
        title="Tạo báo cáo"
        description="Tạo báo cáo tùy chỉnh và tóm tắt bằng AI."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <form onSubmit={handleGenerateReport}>
            <CardHeader>
              <CardTitle>Trình tạo báo cáo</CardTitle>
              <CardDescription>Chọn tiêu chí để tạo báo cáo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-type">Loại báo cáo</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger id="report-type">
                    <SelectValue placeholder="Chọn loại báo cáo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_activity">Hoạt động người dùng</SelectItem>
                    <SelectItem value="content_performance">Hiệu suất nội dung</SelectItem>
                    <SelectItem value="system_health">Tình trạng hệ thống</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Add more filters here based on report type */}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isGeneratingReport}>
                {isGeneratingReport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tạo báo cáo
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {reportData && (
            <Card>
              <CardHeader>
                <CardTitle>Báo cáo đã tạo</CardTitle>
                <CardDescription>
                  Hiển thị kết quả cho báo cáo "{reportType.replace(/_/g, ' ')}".
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Trạng thái</TableHead>
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
                  Tạo tóm tắt tổng quan
                </Button>
              </CardFooter>
            </Card>
          )}

          {isGeneratingSummary && (
             <Card className="flex flex-col items-center justify-center p-8 text-center">
              <Bot className="h-10 w-10 text-primary animate-bounce" />
              <p className="mt-4 font-medium">AI đang phân tích dữ liệu...</p>
              <p className="text-sm text-muted-foreground">Quá trình này có thể mất một lúc.</p>
            </Card>
          )}

          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Tóm tắt tổng quan bằng AI
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
