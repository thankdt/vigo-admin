'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2, Car, DollarSign, RefreshCcw, Share2, Wallet, MinusCircle } from 'lucide-react';
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
  const htxTotal = data.breakdown.htxNetIncome + data.breakdown.htxVatCollected + data.breakdown.htxPitCollected;
  const cards: CardConfig[] = [
    {
      label: 'Tài xế nạp vào ví',
      value: data.cashFlow.driverTopUp,
      icon: <ArrowDownCircle className="h-5 w-5" />,
      hint: 'Tổng top-up vào ví tài xế trong kỳ',
    },
    {
      label: 'Trừ từ ví tài xế',
      value: data.cashFlow.driverDeducted,
      icon: <MinusCircle className="h-5 w-5" />,
      hint: 'Commission + rút + chuyển đi từ ví tài xế',
    },
    {
      label: 'Tổng tiền chuyến đi (kèm thuế)',
      value: data.cashFlow.totalTripIncludingTax,
      icon: <Banknote className="h-5 w-5" />,
      hint: 'SUM(finalPrice) — bao gồm VAT + phụ phí',
      highlight: true,
    },
    {
      label: 'Tiền HTX',
      value: htxTotal,
      icon: <Building2 className="h-5 w-5" />,
      hint: 'Bao gồm VAT + Thuế TNCN HTX phải nộp',
    },
    { label: 'Tiền tài xế', value: data.breakdown.driverNetEarnings, icon: <Car className="h-5 w-5" />, hint: 'Tổng thực nhận của tài xế' },
    { label: 'Affiliate đã credit', value: data.breakdown.affiliateCredited, icon: <Share2 className="h-5 w-5" />, hint: 'Trip commission cho referrer' },
    { label: 'Refund khách', value: data.breakdown.customerRefund, icon: <RefreshCcw className="h-5 w-5" />, hint: 'Tổng REFUND thành công' },
    { label: 'Doanh thu Vigo', value: data.cashFlow.operationalRevenue, icon: <DollarSign className="h-5 w-5" />, hint: 'Commission + phí vào ví doanh thu' },
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
