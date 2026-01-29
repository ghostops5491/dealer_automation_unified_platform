import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle,
  Send,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { historyApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface ChartDataPoint {
  label: string;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
}

interface RecentActivity {
  id: string;
  actionType: string;
  createdAt: string;
  user: { firstName: string; lastName: string; role: string };
  submission: { id: string; flow: { name: string } };
}

const actionLabels: Record<string, string> = {
  CREATED: 'Started',
  TAB_SAVED: 'Saved',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESUBMITTED: 'Resubmitted',
  UPDATED: 'Updated',
};

// Period labels for reference (used in Select component)
// day: 'Daily (30 days)', week: 'Weekly (12 weeks)', month: 'Monthly (1 year)',
// quarter: 'Quarterly (2 years)', year: 'Yearly (5 years)'

// Simple Bar Chart Component
function BarChart({ data, height = 200 }: { data: ChartDataPoint[]; height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.flatMap(d => [d.draft, d.submitted, d.approved, d.rejected])
  );
  const barWidth = Math.max(8, Math.floor((100 / data.length) - 2));
  
  return (
    <div className="relative" style={{ height }}>
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-xs text-gray-400">
        <span>{maxValue}</span>
        <span>{Math.round(maxValue / 2)}</span>
        <span>0</span>
      </div>
      
      {/* Chart area */}
      <div className="ml-12 h-full flex items-end gap-1 pb-8 overflow-x-auto">
        {data.map((point, idx) => {
          const scale = maxValue > 0 ? (height - 40) / maxValue : 0;
          
          return (
            <div key={idx} className="flex flex-col items-center" style={{ minWidth: `${barWidth}px` }}>
              <div className="flex gap-0.5 items-end h-full">
                {point.draft > 0 && (
                  <div
                    className="bg-gray-400 rounded-t"
                    style={{ height: point.draft * scale, width: '6px' }}
                    title={`Draft: ${point.draft}`}
                  />
                )}
                {point.submitted > 0 && (
                  <div
                    className="bg-yellow-400 rounded-t"
                    style={{ height: point.submitted * scale, width: '6px' }}
                    title={`Pending: ${point.submitted}`}
                  />
                )}
                {point.approved > 0 && (
                  <div
                    className="bg-green-400 rounded-t"
                    style={{ height: point.approved * scale, width: '6px' }}
                    title={`Approved: ${point.approved}`}
                  />
                )}
                {point.rejected > 0 && (
                  <div
                    className="bg-red-400 rounded-t"
                    style={{ height: point.rejected * scale, width: '6px' }}
                    title={`Rejected: ${point.rejected}`}
                  />
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                {point.label.length > 7 ? point.label.substring(5) : point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Donut Chart Component
function DonutChart({ 
  draft, 
  pending, 
  approved, 
  rejected 
}: { 
  draft: number; 
  pending: number; 
  approved: number; 
  rejected: number;
}) {
  const total = draft + pending + approved + rejected;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No data available
      </div>
    );
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  
  const segments = [
    { value: draft, color: '#9CA3AF', label: 'Draft' },
    { value: pending, color: '#FBBF24', label: 'Pending' },
    { value: approved, color: '#34D399', label: 'Approved' },
    { value: rejected, color: '#F87171', label: 'Rejected' },
  ].filter(s => s.value > 0);

  let offset = 0;
  
  return (
    <div className="flex items-center justify-center gap-8">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {segments.map((segment, idx) => {
            const percentage = segment.value / total;
            const strokeDasharray = `${percentage * circumference} ${circumference}`;
            const rotation = offset * 360 - 90;
            offset += percentage;
            
            return (
              <circle
                key={idx}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="20"
                strokeDasharray={strokeDasharray}
                transform={`rotate(${rotation} 80 80)`}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-3xl font-bold">{total}</span>
          <span className="text-sm text-gray-500">Total</span>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((segment, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-sm text-gray-600">
              {segment.label}: <strong>{segment.value}</strong> ({Math.round(segment.value / total * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Analytics() {
  const [period, setPeriod] = useState<Period>('month');

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', period],
    queryFn: async () => {
      const res = await historyApi.getAnalytics(period);
      return res.data.data;
    },
  });

  const summary = analyticsData?.summary || { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 };
  const chartData = analyticsData?.chartData || [];
  const recentActivity = analyticsData?.recentActivity || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Track form submissions and performance</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[200px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily (30 days)</SelectItem>
            <SelectItem value="week">Weekly (12 weeks)</SelectItem>
            <SelectItem value="month">Monthly (1 year)</SelectItem>
            <SelectItem value="quarter">Quarterly (2 years)</SelectItem>
            <SelectItem value="year">Yearly (5 years)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Clock className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Forms</p>
                    <p className="text-2xl font-bold">{summary.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-100 rounded-lg">
                    <Clock className="h-6 w-6 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Drafts</p>
                    <p className="text-2xl font-bold">{summary.draft}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <Send className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Pending</p>
                    <p className="text-2xl font-bold">{summary.pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Approved</p>
                    <p className="text-2xl font-bold">{summary.approved}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 rounded-lg">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Rejected</p>
                    <p className="text-2xl font-bold">{summary.rejected}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Submissions Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={chartData} height={250} />
                <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-400 rounded" />
                    <span>Draft</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-400 rounded" />
                    <span>Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-400 rounded" />
                    <span>Approved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-400 rounded" />
                    <span>Rejected</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Donut Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  draft={summary.draft}
                  pending={summary.pending}
                  approved={summary.approved}
                  rejected={summary.rejected}
                />
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No recent activity</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((activity: RecentActivity) => (
                    <div 
                      key={activity.id} 
                      className="flex items-center justify-between py-3 border-b last:border-0"
                    >
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">
                          {actionLabels[activity.actionType]}
                        </Badge>
                        <div>
                          <p className="font-medium text-gray-900">
                            {activity.submission.flow.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {activity.user.firstName} {activity.user.lastName}
                            <span className="text-gray-400"> • {activity.user.role}</span>
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-400">
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

