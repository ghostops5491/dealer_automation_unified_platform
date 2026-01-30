import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Workflow, FileText, Clock, CheckCircle2, XCircle, AlertCircle, Key } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth';
import { flowApi, formApi, otpConfigApi } from '@/lib/api';
import { formatDateTime, getStatusColor } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Flow, FormSubmission } from '@/types';

export function UserDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [otpValue, setOtpValue] = useState('');
  const [isUpdatingOtp, setIsUpdatingOtp] = useState(false);

  // OTP mutation
  const updateOtpMutation = useMutation({
    mutationFn: (otp: string) => otpConfigApi.updateOtp(otp),
    onSuccess: (_data, otp) => {
      toast({ title: 'OTP Updated', description: `TVS OTP set to ${otp}` });
      setIsUpdatingOtp(false);
      setOtpValue('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update OTP',
        variant: 'destructive',
      });
      setIsUpdatingOtp(false);
    },
  });

  const handleOtpUpdate = () => {
    if (!otpValue || !/^\d{4}$/.test(otpValue)) {
      toast({
        title: 'Invalid OTP',
        description: 'OTP must be exactly 4 digits',
        variant: 'destructive',
      });
      return;
    }
    setIsUpdatingOtp(true);
    updateOtpMutation.mutate(otpValue);
  };

  const { data: flowsData } = useQuery({
    queryKey: ['my-flows'],
    queryFn: () => flowApi.getMyFlows(),
  });

  const { data: submissionsData } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => formApi.getMySubmissions(),
  });

  const { data: pendingData } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => formApi.getPendingApprovals(),
    enabled: user?.role === 'MANAGER',
  });

  const { data: pendingInsuranceData } = useQuery({
    queryKey: ['pending-insurance-approvals'],
    queryFn: () => formApi.getPendingInsuranceApprovals(),
    enabled: user?.role === 'INSURANCE_EXECUTIVE',
  });

  // Get branch stats (Managers see all branch submissions, others see their own)
  const { data: statsData } = useQuery({
    queryKey: ['branch-stats'],
    queryFn: () => formApi.getStats(),
  });

  const flows = flowsData?.data?.data || [];
  const submissions = submissionsData?.data?.data || [];
  const pendingApprovals = pendingData?.data?.data || [];
  const pendingInsuranceApprovals = pendingInsuranceData?.data?.data || [];
  const stats = statsData?.data?.data || { draft: 0, pending: 0, pendingInsurance: 0, pendingManager: 0, approved: 0, rejected: 0 };

  const draftCount = stats.draft;
  const pendingCount = stats.pending;
  const approvedCount = stats.approved;
  const rejectedCount = stats.rejected;

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome, {user?.firstName || user?.username}!
          </h1>
          <p className="text-muted-foreground">
            {user?.branch?.name} • {user?.branch?.organization?.name}
          </p>
        </div>
        
        {/* TVS OTP Update - Top Right */}
        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 shadow-sm">
          <Key className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800 whitespace-nowrap">TVS OTP:</span>
          <Input
            type="text"
            maxLength={4}
            placeholder="0000"
            value={otpValue}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              setOtpValue(value);
            }}
            className="w-16 h-8 text-center font-mono text-sm px-1"
          />
          <Button
            size="sm"
            className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white"
            onClick={handleOtpUpdate}
            disabled={isUpdatingOtp || !otpValue || otpValue.length !== 4}
          >
            {isUpdatingOtp ? '...' : 'Update'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-700">
          {user?.role === 'MANAGER' || user?.role === 'INSURANCE_EXECUTIVE' ? 'Branch Statistics' : 'My Statistics'}
        </h2>
        {(user?.role === 'MANAGER' || user?.role === 'INSURANCE_EXECUTIVE') && (
          <p className="text-sm text-muted-foreground">Showing all submissions in your branch</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <FileText className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{draftCount}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Manager Approval Queue */}
      {user?.role === 'MANAGER' && pendingApprovals.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-800">Pending Approvals</CardTitle>
            </div>
            <CardDescription className="text-yellow-700">
              {pendingApprovals.length} submissions waiting for your review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/dashboard/approvals')} variant="outline">
              Review Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Insurance Executive Approval Queue */}
      {user?.role === 'INSURANCE_EXECUTIVE' && pendingInsuranceApprovals.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-blue-800">Pending Insurance Approvals</CardTitle>
            </div>
            <CardDescription className="text-blue-700">
              {pendingInsuranceApprovals.length} submissions waiting for insurance review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/dashboard/insurance-approvals')} variant="outline">
              Review Now
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Available Flows */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Available Flows
            </CardTitle>
            <CardDescription>Start a new form submission</CardDescription>
          </CardHeader>
          <CardContent>
            {flows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No flows assigned to your branch
              </p>
            ) : (
              <div className="space-y-3">
                {flows.map((flow: Flow) => (
                  <div
                    key={flow.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-secondary/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{flow.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {flow.flowScreens?.length || 0} steps
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/dashboard/flows/${flow.id}/new`)}
                      disabled={user?.role === 'VIEWER'}
                    >
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Submissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Submissions
            </CardTitle>
            <CardDescription>Your latest form submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No submissions yet
              </p>
            ) : (
              <div className="space-y-3">
                {submissions.slice(0, 5).map((submission: FormSubmission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/submissions/${submission.id}`)}
                  >
                    <div>
                      <p className="font-medium">{submission.flow?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(submission.updatedAt)}
                      </p>
                    </div>
                    <Badge className={getStatusColor(submission.status)}>
                      {submission.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
                {submissions.length > 5 && (
                  <Button
                    variant="link"
                    className="w-full"
                    onClick={() => navigate('/dashboard/submissions')}
                  >
                    View all submissions
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

