import { StatCards } from './components/stat-cards';
import { UserSignupsChart, ContentPublishedChart } from './components/charts';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <StatCards />
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <UserSignupsChart />
        <ContentPublishedChart />
      </div>
    </div>
  );
}
