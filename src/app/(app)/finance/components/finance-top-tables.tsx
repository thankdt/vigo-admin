'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

export function FinanceTopTables({ data }: { data: FinanceDashboard }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 HTX</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topHtx.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HTX</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Net income</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topHtx.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/transport-companies/${r.id}`} className="text-primary hover:underline">{r.name}</Link>
                    </TableCell>
                    <TableCell className="text-right">{r.bookingCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.netIncome)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 tài xế</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topDrivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tài xế</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Net earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDrivers.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/drivers?driverId=${r.id}`} className="text-primary hover:underline">
                        {r.fullName || 'N/A'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.bookingCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.netEarnings)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 affiliate</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topAffiliates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người giới thiệu</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Đã credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topAffiliates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/referrals?referrerId=${r.id}`} className="text-primary hover:underline">
                        {r.fullName || 'N/A'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.tripCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.totalCredited)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
