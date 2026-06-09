'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFinanceDashboard, type FinanceDashboard } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from './components/finance-filter';
import { FinanceStatCards } from './components/finance-stat-cards';
import { FinanceDrilldownChart } from './components/finance-drilldown-chart';
import { FinanceTopTables } from './components/finance-top-tables';

export default function FinancePage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [data, setData] = React.useState<FinanceDashboard | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  // Drill-down: which card's time series is expanded below the grid.
  const [drill, setDrill] = React.useState<{ metric: string; label: string } | null>(null);

  const load = React.useCallback(async (r: DateRange) => {
    setIsLoading(true);
    try {
      const result = await getFinanceDashboard(r.from, r.to);
      setData(result);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load(range);
  }, [range, load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tài chính</h1>
        <p className="text-sm text-muted-foreground">Dòng tiền hệ thống, hạng mục thu chi và các bảng xếp hạng.</p>
      </div>

      <FinanceFilter value={range} onChange={setRange} isLoading={isLoading} />

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          <FinanceStatCards
            data={data}
            selected={drill?.metric ?? null}
            onSelect={(metric, label) =>
              setDrill((d) => (d?.metric === metric ? null : { metric, label }))
            }
          />
          {drill && (
            <FinanceDrilldownChart
              metric={drill.metric}
              label={drill.label}
              range={range}
              onClose={() => setDrill(null)}
            />
          )}
          <FinanceTopTables data={data} />
        </>
      ) : null}
    </div>
  );
}
