'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2, Car, DollarSign, RefreshCcw, Share2 } from 'lucide-react';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

type CardConfig = {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  highlight?: boolean;
  negative?: boolean;
};

export function FinanceStatCards({ data }: { data: FinanceDashboard }) {
  const cards: CardConfig[] = [
    { label: 'Tổng vào', value: data.cashFlow.totalIn, icon: <ArrowDownCircle className="h-5 w-5" />, hint: 'Dòng tiền chảy vào hệ thống' },
    { label: 'Tổng ra', value: data.cashFlow.totalOut, icon: <ArrowUpCircle className="h-5 w-5" />, hint: 'Dòng tiền chảy ra khỏi hệ thống' },
    { label: 'Net', value: data.cashFlow.net, icon: <Banknote className="h-5 w-5" />, hint: 'Vào − Ra', highlight: true, negative: data.cashFlow.net < 0 },
    { label: 'Doanh thu Vigo', value: data.cashFlow.operationalRevenue, icon: <DollarSign className="h-5 w-5" />, hint: 'Commission + phí vào ví doanh thu' },
    { label: 'Tiền HTX', value: data.breakdown.htxNetIncome, icon: <Building2 className="h-5 w-5" />, hint: 'Tổng phần các HTX' },
    { label: 'Tiền tài xế', value: data.breakdown.driverNetEarnings, icon: <Car className="h-5 w-5" />, hint: 'Tổng thực nhận của tài xế' },
    { label: 'Affiliate đã credit', value: data.breakdown.affiliateCredited, icon: <Share2 className="h-5 w-5" />, hint: 'Trip commission cho referrer' },
    { label: 'Refund khách', value: data.breakdown.customerRefund, icon: <RefreshCcw className="h-5 w-5" />, hint: 'Tổng REFUND thành công' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={c.highlight ? 'border-primary' : undefined}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <div className={c.highlight ? 'text-primary' : 'text-muted-foreground'}>{c.icon}</div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${c.highlight ? 'text-primary' : ''} ${c.negative ? 'text-destructive' : ''}`}>
              {fmtVnd(c.value)}
            </div>
            {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
