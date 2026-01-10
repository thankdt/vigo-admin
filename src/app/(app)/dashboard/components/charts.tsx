'use client';

import { Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { userSignupsData, contentPublishedData } from '@/lib/data';

const chartConfigSignups = {
  "New Users": {
    label: "New Users",
    color: "hsl(var(--primary))",
  },
};

const chartConfigContent = {
  "Published": {
    label: "Published",
    color: "hsl(var(--primary))",
  },
  "Drafts": {
    label: "Drafts",
    color: "hsl(var(--secondary-foreground))",
  },
}

export function UserSignupsChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Users Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfigSignups} className="h-[300px] w-full">
          <LineChart data={userSignupsData} margin={{ left: 12, right: 12 }}>
             <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis />
            <Tooltip cursor={false} content={<ChartTooltipContent />} />
            <Line
              dataKey="New Users"
              type="monotone"
              stroke="var(--color-New-Users)"
              strokeWidth={2}
              dot={true}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function ContentPublishedChart() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Content Status</CardTitle>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfigContent} className="h-[300px] w-full">
                    <BarChart data={contentPublishedData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                        />
                        <YAxis />
                        <Tooltip cursor={false} content={<ChartTooltipContent />} />
                        <Legend content={<ChartLegendContent />} />
                        <Bar dataKey="Published" fill="var(--color-Published)" radius={4} />
                        <Bar dataKey="Drafts" fill="var(--color-Drafts)" radius={4} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
