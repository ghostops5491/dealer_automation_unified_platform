import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Send, 
  Edit, 
  PlayCircle,
  ChevronRight,
  Filter,
  Eye,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { historyApi, flowApi } from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';

interface HistoryItem {
  id: string;
  actionType: string;
  tabIndex?: number;
  tabName?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface SubmissionWithHistory {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  flow: { id: string; name: string; code: string };
  user: { id: string; firstName: string; lastName: string; username: string };
  history: HistoryItem[];
  lastActivity?: HistoryItem;
}

const actionIcons: Record<string, React.ReactNode> = {
  CREATED: <PlayCircle className="h-4 w-4 text-blue-500" />,
  TAB_SAVED: <Edit className="h-4 w-4 text-yellow-500" />,
  SUBMITTED: <Send className="h-4 w-4 text-purple-500" />,
  APPROVED: <CheckCircle className="h-4 w-4 text-green-500" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-500" />,
  RESUBMITTED: <RefreshCw className="h-4 w-4 text-orange-500" />,
  UPDATED: <Edit className="h-4 w-4 text-gray-500" />,
};

const actionLabels: Record<string, string> = {
  CREATED: 'Form Started',
  TAB_SAVED: 'Section Saved',
  SUBMITTED: 'Submitted for Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESUBMITTED: 'Resubmitted',
  UPDATED: 'Updated',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-500',
  PENDING_APPROVAL: 'bg-yellow-500',
  APPROVED: 'bg-green-500',
  REJECTED: 'bg-red-500',
};

export function History() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  // Fetch branch history
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['branchHistory', statusFilter, flowFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (flowFilter !== 'all') params.flowId = flowFilter;
      const res = await historyApi.getBranchHistory(params as any);
      return res.data.data;
    },
  });

  // Fetch flows for filter
  const { data: flowsData } = useQuery({
    queryKey: ['myFlows'],
    queryFn: async () => {
      const res = await flowApi.getMyFlows();
      return res.data.data;
    },
  });

  // Fetch detailed history for selected submission
  const { data: detailHistory } = useQuery({
    queryKey: ['submissionHistory', selectedSubmission],
    queryFn: async () => {
      if (!selectedSubmission) return null;
      const res = await historyApi.getSubmissionHistory(selectedSubmission);
      return res.data.data;
    },
    enabled: !!selectedSubmission,
  });

  const submissions = historyData?.submissions || [];
  const flows = flowsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Form History</h1>
          <p className="text-gray-600 mt-1">Track all form activities and submissions</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={flowFilter} onValueChange={setFlowFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by flow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flows</SelectItem>
                {flows.map((flow: any) => (
                  <SelectItem key={flow.id} value={flow.id}>
                    {flow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-gray-600">Loading history...</p>
            </CardContent>
          </Card>
        ) : submissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No history found</h3>
              <p className="mt-2 text-gray-600">
                Start filling forms to see history here
              </p>
            </CardContent>
          </Card>
        ) : (
          submissions.map((submission: SubmissionWithHistory) => (
            <Card 
              key={submission.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedSubmission(submission.id)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {submission.flow.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Started by {submission.user.firstName} {submission.user.lastName}
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(submission.createdAt), 'PPpp')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Badge className={statusColors[submission.status]}>
                        {submission.status.replace('_', ' ')}
                      </Badge>
                      {submission.lastActivity && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last: {actionLabels[submission.lastActivity.actionType]}
                          <br />
                          {formatDistanceToNow(new Date(submission.lastActivity.createdAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4 mr-1" />
                      Details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* History Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Form Timeline
            </DialogTitle>
          </DialogHeader>
          
          {detailHistory && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Flow</p>
                    <p className="font-medium">{detailHistory.submission.flowName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <Badge className={statusColors[detailHistory.submission.status]}>
                      {detailHistory.submission.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created By</p>
                    <p className="font-medium">
                      {detailHistory.submission.createdBy.firstName} {detailHistory.submission.createdBy.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Started</p>
                    <p className="font-medium">
                      {format(new Date(detailHistory.submission.createdAt), 'PPpp')}
                    </p>
                  </div>
                  {detailHistory.submission.submittedAt && (
                    <div>
                      <p className="text-sm text-gray-500">Submitted</p>
                      <p className="font-medium">
                        {format(new Date(detailHistory.submission.submittedAt), 'PPpp')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-4">
                  {detailHistory.history.map((item: HistoryItem) => (
                    <div key={item.id} className="relative flex gap-4 pl-10">
                      <div className="absolute left-2 p-1 bg-white border-2 border-gray-200 rounded-full">
                        {actionIcons[item.actionType]}
                      </div>
                      <div className="flex-1 bg-white border rounded-lg p-4 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {actionLabels[item.actionType]}
                              {item.tabName && (
                                <span className="text-gray-500 font-normal">
                                  {' '}— {item.tabName}
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-gray-500">
                              by {item.user.firstName} {item.user.lastName}
                              <span className="text-gray-400"> ({item.user.role})</span>
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {format(new Date(item.createdAt), 'PPpp')}
                          </p>
                        </div>
                        {item.details && Object.keys(item.details).length > 0 && (
                          <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                            {(item.details as Record<string, unknown>).comments ? (
                              <p>
                                <span className="font-medium">Comment:</span> {String((item.details as Record<string, unknown>).comments)}
                              </p>
                            ) : null}
                            {(item.details as Record<string, unknown>).fieldCount ? (
                              <p>
                                <span className="font-medium">Fields saved:</span> {String((item.details as Record<string, unknown>).fieldCount)}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setSelectedSubmission(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    navigate(`/dashboard/forms/${selectedSubmission}`);
                    setSelectedSubmission(null);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Form
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

