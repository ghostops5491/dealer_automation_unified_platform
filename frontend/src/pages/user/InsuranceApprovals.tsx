import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Eye, User, ShieldCheck, FileText, Edit, Play, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formApi, jobApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { FormSubmission } from '@/types';

interface ScreenApprovalInfo {
  screenId: string;
  screenName: string;
  screenCode: string;
  tabName: string;
  tabOrder: number;
}

interface SubmissionWithApprovalInfo extends FormSubmission {
  screensRequiringInsuranceApproval?: ScreenApprovalInfo[];
}

export function InsuranceApprovals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [comments, setComments] = useState('');
  const [runningInsuranceJob, setRunningInsuranceJob] = useState<string | null>(null);

  // Insurance Job mutation
  const insuranceJobMutation = useMutation({
    mutationFn: ({ enquiryNo, submissionId }: { enquiryNo: string; submissionId: string }) =>
      jobApi.runInsurance(enquiryNo, submissionId),
    onSuccess: (response) => {
      toast({
        title: 'Insurance Job Started',
        description: response.data?.message || 'Job has been started',
      });
      setRunningInsuranceJob(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Cannot Run Insurance Job',
        description: error.response?.data?.error || 'Failed to start insurance job',
        variant: 'destructive',
      });
      setRunningInsuranceJob(null);
    },
  });

  const handleRunInsuranceJob = (submission: FormSubmission) => {
    // Try to get enquiry number from the submission data
    const formData = submission.data as Record<string, any> || {};
    const enquiryNo = formData?.enquiry_details?.enquiry_number || 
                      formData?.customer_details?.enquiry_number ||
                      formData?.enquiryNumber ||
                      submission.id; // Fallback to submission ID
    
    setRunningInsuranceJob(submission.id);
    insuranceJobMutation.mutate({ 
      enquiryNo: String(enquiryNo), 
      submissionId: submission.id 
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pending-insurance-approvals'],
    queryFn: () => formApi.getPendingInsuranceApprovals(),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      formApi.insuranceApprove(id, comments),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['pending-insurance-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      toast({ 
        title: 'Insurance approval successful',
        description: response.data?.message || 'Submission approved by Insurance Executive'
      });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      formApi.insuranceReject(id, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-insurance-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      toast({ title: 'Submission rejected and sent back for revision' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const openDialog = (submission: FormSubmission, action: 'approve' | 'reject') => {
    setSelectedSubmission(submission);
    setActionType(action);
    setComments('');
  };

  const closeDialog = () => {
    setSelectedSubmission(null);
    setActionType(null);
    setComments('');
  };

  const handleConfirm = () => {
    if (!selectedSubmission || !actionType) return;

    if (actionType === 'approve') {
      approveMutation.mutate({ id: selectedSubmission.id, comments });
    } else {
      rejectMutation.mutate({ id: selectedSubmission.id, comments });
    }
  };

  const submissions = data?.data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24 bg-muted" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Insurance Approvals</h1>
        <p className="text-muted-foreground">Review and approve insurance details for submissions</p>
      </div>

      {submissions.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
          <h3 className="mt-4 text-lg font-semibold">All caught up!</h3>
          <p className="text-muted-foreground">No submissions waiting for insurance approval</p>
        </Card>
      ) : (
        <div className="space-y-4 stagger-children">
          {submissions.map((submission: SubmissionWithApprovalInfo) => (
            <Card key={submission.id} className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{submission.flow?.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        {submission.user?.firstName} {submission.user?.lastName}
                        <span className="text-xs">(@{submission.user?.username})</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Submitted: {formatDateTime(submission.submittedAt || submission.updatedAt)}
                      </p>
                      <Badge variant="outline" className="mt-1 text-blue-600 border-blue-600">
                        Pending Insurance Review
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/submissions/${submission.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/submissions/${submission.id}?edit=insurance`)}
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit Insurance
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => openDialog(submission, 'approve')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDialog(submission, 'reject')}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-300"
                      onClick={() => handleRunInsuranceJob(submission)}
                      disabled={runningInsuranceJob === submission.id}
                    >
                      {runningInsuranceJob === submission.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Perform Insurance
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Screens requiring insurance approval */}
                {submission.screensRequiringInsuranceApproval && submission.screensRequiringInsuranceApproval.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 mb-2">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="font-medium">Screens requiring your approval:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {submission.screensRequiringInsuranceApproval.map((screen) => (
                        <Badge
                          key={screen.screenId}
                          variant="secondary"
                          className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                        >
                          {screen.tabName} ({screen.screenName})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedSubmission && !!actionType} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Insurance Details' : 'Reject Submission'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? 'Confirm that the insurance details are correct. The submission may then proceed to Manager approval if configured.'
                : 'Please provide a reason for rejecting this submission. It will be sent back to the user for corrections.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Comments {actionType === 'reject' && '(required for rejection)'}</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={
                actionType === 'approve'
                  ? 'Optional comments about the insurance details...'
                  : 'Please explain what needs to be corrected...'
              }
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              onClick={handleConfirm}
              disabled={
                (actionType === 'reject' && !comments.trim()) ||
                approveMutation.isPending ||
                rejectMutation.isPending
              }
            >
              {approveMutation.isPending || rejectMutation.isPending ? 'Processing...' : actionType === 'approve' ? 'Approve Insurance' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

