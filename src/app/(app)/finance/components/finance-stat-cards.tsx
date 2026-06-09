'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownCircle, Banknote, Building2, Car, DollarSign, Gift, Landmark, Percent, Share2, Wallet, MinusCircle } from 'lucide-react';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

type CardConfig = {
  metric: string; // series key for drill-down
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  green?: boolean; // green frame (doanh thu VIGO)
};

export function FinanceStatCards({
  data,
  selected,
  onSelect,
}: {
  data: FinanceDashboard;
  selected?: string | null;
  onSelect?: (metric: string, label: string) => void;
}) {
  const b = data.breakdown;
  const cards: CardConfig[] = [
    { metric: 'driverPayosTopUp', label: 'Nạp ví qua PayOS', value: data.cashFlow.driverPayosTopUp, icon: <ArrowDownCircle className="h-5 w-5" />, hint: 'Top-up thật qua cổng thanh toán (khớp PayOS)' },
    { metric: 'driverAdminPromoCredit', label: 'Admin / Promo nạp', value: data.cashFlow.driverAdminPromoCredit, icon: <Gift className="h-5 w-5" />, hint: 'Admin nạp tay + credit khuyến mãi (không qua PayOS)' },
    { metric: 'driverDeducted', label: 'Trừ từ ví tài xế', value: data.cashFlow.driverDeducted, icon: <MinusCircle className="h-5 w-5" />, hint: 'Commission + chuyển đi từ ví tài xế' },
    { metric: 'totalTripIncludingTax', label: 'Tổng tiền chuyến đi (kèm thuế)', value: data.cashFlow.totalTripIncludingTax, icon: <Banknote className="h-5 w-5" />, hint: 'SUM(finalPrice) chuyến hoàn thành — gồm VAT + phụ phí' },
    { metric: 'vigoRevenue', label: 'Doanh thu VIGO', value: b.vigoRevenue, icon: <DollarSign className="h-5 w-5" />, hint: 'Hoa hồng VIGO giữ (KHÔNG gồm VAT VIGO phải nộp)', green: true },
    { metric: 'totalVat', label: 'Tổng VAT', value: b.totalVat, icon: <Percent className="h-5 w-5" />, hint: 'VAT của tất cả chuyến trong kỳ' },
    { metric: 'vigoVatRemit', label: 'VAT VIGO phải nộp', value: b.vigoVatRemit, icon: <Landmark className="h-5 w-5" />, hint: 'Phần VAT VIGO nộp NN (theo tỉ lệ phí nền tảng)' },
    { metric: 'htxTotalReceived', label: 'Tổng phải đưa HTX', value: b.htxTotalReceived, icon: <Building2 className="h-5 w-5" />, hint: 'Hoa hồng HTX + VAT HTX + PIT' },
    { metric: 'driverTotalReceived', label: 'Tổng thu nhập tài xế', value: b.driverTotalReceived, icon: <Car className="h-5 w-5" />, hint: 'Tiền thực nhận của tài xế (gồm hoàn discount)' },
    { metric: 'affiliateCredited', label: 'Affiliate đã credit', value: b.affiliateCredited, icon: <Share2 className="h-5 w-5" />, hint: 'Hoa hồng giới thiệu (net clawback)' },
    { metric: 'affiliateWithdrawn', label: 'Affiliate đã rút', value: b.affiliateWithdrawn, icon: <Wallet className="h-5 w-5" />, hint: 'Yêu cầu rút đã chuyển khoản trong kỳ' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const isSelected = selected === c.metric;
        const frame = c.green ? 'border-green-500' : '';
        const sel = isSelected ? 'ring-2 ring-primary' : '';
        return (
          <Card
            key={c.metric}
            onClick={() => onSelect?.(c.metric, c.label)}
            className={`cursor-pointer transition-shadow hover:shadow-md ${frame} ${sel}`.trim()}
            title="Bấm để xem biểu đồ theo thời gian"
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={c.green ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                {c.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${c.green ? 'text-green-600 dark:text-green-400' : ''}`}>
                {fmtVnd(c.value)}
              </div>
              {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
