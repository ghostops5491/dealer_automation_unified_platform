import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Clock, CheckCircle2, XCircle, Eye, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formApi } from '@/lib/api';
import { formatDateTime, getStatusColor } from '@/lib/utils';
import type { FormSubmission } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Drafts',
  PENDING_APPROVAL: 'Pending Approval',
  PENDING_INSURANCE_APPROVAL: 'Pending Insurance',
  PENDING_MANAGER_APPROVAL: 'Pending Manager',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export function UserSubmissions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<FormSubmission | null>(null);

  const statusFilter = searchParams.get('status') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => formApi.getMySubmissions(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => formApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['branch-stats'] });
      toast({ title: 'Draft deleted successfully' });
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete draft',
        variant: 'destructive',
      });
      setDeleteTarget(null);
    },
  });

  const allSubmissions: FormSubmission[] = data?.data?.data || [];

  const submissions = statusFilter
    ? allSubmissions.filter((s: FormSubmission) => {
        if (statusFilter === 'PENDING') {
          return s.status === 'PENDING_APPROVAL' || s.status === 'PENDING_INSURANCE_APPROVAL' || s.status === 'PENDING_MANAGER_APPROVAL';
        }
        return s.status === statusFilter;
      })
    : allSubmissions;

  const clearFilter = () => {
    setSearchParams({});
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <FileText className="h-4 w-4" />;
      case 'PENDING_APPROVAL':
      case 'PENDING_INSURANCE_APPROVAL':
      case 'PENDING_MANAGER_APPROVAL':
        return <Clock className="h-4 w-4" />;
      case 'APPROVED':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'REJECTED':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {statusFilter
              ? (statusFilter === 'PENDING' ? 'Pending Submissions' : (STATUS_LABELS[statusFilter] || statusFilter))
              : 'My Submissions'}
          </h1>
          <p className="text-muted-foreground">
            {statusFilter
              ? `Showing ${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`
              : 'View and manage your form submissions'}
          </p>
        </div>
        {statusFilter && (
          <Button variant="outline" size="sm" onClick={clearFilter}>
            <X className="h-4 w-4 mr-1" />
            Clear Filter
          </Button>
        )}
      </div>

      {submissions.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No submissions yet</h3>
          <p className="text-muted-foreground">Start a new flow to create your first submission</p>
          <Button onClick={() => navigate('/dashboard/flows')} className="mt-4">
            View Available Flows
          </Button>
        </Card>
      ) : (
        <div className="space-y-4 stagger-children">
          {submissions.map((submission: FormSubmission) => (
            <Card
              key={submission.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/dashboard/submissions/${submission.id}`)}
            >
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary">
                    {getStatusIcon(submission.status)}
                  </div>
                  <div>
                    <h3 className="font-semibold">{submission.flow?.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Created: {formatDateTime(submission.createdAt)}
                    </p>
                    {submission.updatedAt && submission.updatedAt !== submission.createdAt && (
                      <p className="text-sm text-muted-foreground">
                        Last Modified: {formatDateTime(submission.updatedAt)}
                      </p>
                    )}
                    {submission.submittedAt && (
                      <p className="text-sm text-muted-foreground">
                        Submitted: {formatDateTime(submission.submittedAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <Badge className={getStatusColor(submission.status)}>
                      {submission.status.replace('_', ' ')}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Step {(submission.currentTabIndex || 0) + 1} of{' '}
                      {submission.flow?.flowScreens?.length || 0}
                    </p>
                  </div>

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {submission.status === 'DRAFT' || submission.status === 'REJECTED' ? (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(`/dashboard/submissions/${submission.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(`/dashboard/submissions/${submission.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {submission.status === 'DRAFT' && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setDeleteTarget(submission)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>

              {/* Show rejection reason if rejected */}
              {submission.status === 'REJECTED' && submission.approvals?.[0]?.comments && (
                <div className="px-6 pb-4 border-t">
                  <p className="text-sm text-destructive mt-2">
                    <strong>Rejection reason:</strong> {submission.approvals[0].comments}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft for "{deleteTarget?.flow?.name}"?
              This action cannot be undone and all saved data in this draft will be permanently lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

