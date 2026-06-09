'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownCircle, Banknote, Building2, Car, DollarSign, Landmark, Percent, Share2, Wallet, MinusCircle } from 'lucide-react';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

type CardConfig = {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  highlight?: boolean; // primary frame (tổng tiền chuyến đi)
  green?: boolean; // green "selected" frame (doanh thu VIGO)
};

export function FinanceStatCards({ data }: { data: FinanceDashboard }) {
  const b = data.breakdown;
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
      hint: 'Commission + chuyển đi từ ví tài xế',
    },
    {
      label: 'Tổng tiền chuyến đi (kèm thuế)',
      value: data.cashFlow.totalTripIncludingTax,
      icon: <Banknote className="h-5 w-5" />,
      hint: 'SUM(finalPrice) chuyến hoàn thành — gồm VAT + phụ phí',
      highlight: true,
    },
    {
      label: 'Doanh thu VIGO',
      value: b.vigoRevenue,
      icon: <DollarSign className="h-5 w-5" />,
      hint: 'Hoa hồng VIGO giữ (KHÔNG gồm VAT VIGO phải nộp)',
      green: true,
    },
    {
      label: 'Tổng VAT',
      value: b.totalVat,
      icon: <Percent className="h-5 w-5" />,
      hint: 'VAT của tất cả chuyến trong kỳ',
    },
    {
      label: 'VAT VIGO phải nộp',
      value: b.vigoVatRemit,
      icon: <Landmark className="h-5 w-5" />,
      hint: 'Phần VAT VIGO nộp NN (theo tỉ lệ phí nền tảng)',
    },
    {
      label: 'Tổng phải đưa HTX',
      value: b.htxTotalReceived,
      icon: <Building2 className="h-5 w-5" />,
      hint: 'Hoa hồng HTX + VAT HTX + PIT',
    },
    {
      label: 'Tổng thu nhập tài xế',
      value: b.driverTotalReceived,
      icon: <Car className="h-5 w-5" />,
      hint: 'Tiền thực nhận của tài xế (gồm hoàn discount)',
    },
    {
      label: 'Affiliate đã credit',
      value: b.affiliateCredited,
      icon: <Share2 className="h-5 w-5" />,
      hint: 'Hoa hồng giới thiệu (chuyến hoàn thành)',
    },
    {
      label: 'Affiliate đã rút',
      value: b.affiliateWithdrawn,
      icon: <Wallet className="h-5 w-5" />,
      hint: 'Yêu cầu rút đã chuyển khoản trong kỳ',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card
          key={c.label}
          className={c.green ? 'border-green-500 ring-1 ring-green-500/40' : c.highlight ? 'border-primary' : undefined}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <div className={c.green ? 'text-green-600 dark:text-green-400' : c.highlight ? 'text-primary' : 'text-muted-foreground'}>
              {c.icon}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${c.green ? 'text-green-600 dark:text-green-400' : c.highlight ? 'text-primary' : ''}`}
            >
              {fmtVnd(c.value)}
            </div>
            {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
