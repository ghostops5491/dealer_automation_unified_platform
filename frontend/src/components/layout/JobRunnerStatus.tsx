import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Loader2, RefreshCw, RotateCcw, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface JobRunnerStatusProps {
  collapsed?: boolean;
  className?: string;
}

export function JobRunnerStatus({ collapsed = false, className }: JobRunnerStatusProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [awaitingRestart, setAwaitingRestart] = useState(false);

  const canRestart =
    user?.type === 'superadmin' || user?.role === 'MANAGER';

  const { data: healthData, isFetching } = useQuery({
    queryKey: ['job-runner-health'],
    queryFn: async () => {
      const res = await jobApi.getRunnerHealth();
      return res.data;
    },
    refetchInterval: awaitingRestart ? 2000 : 30000,
  });

  const running = healthData?.running === true;

  const restartMutation = useMutation({
    mutationFn: () => jobApi.restartRunner(),
    onSuccess: async () => {
      setAwaitingRestart(true);
      toast({
        title: 'Restart initiated',
        description: 'Waiting for job runner to come back online…',
      });

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await queryClient.fetchQuery({
          queryKey: ['job-runner-health'],
          queryFn: async () => (await jobApi.getRunnerHealth()).data,
        });
        if (res?.running) {
          setAwaitingRestart(false);
          toast({
            title: 'Job runner online',
            description: 'Automation service is ready.',
          });
          return;
        }
      }

      setAwaitingRestart(false);
      toast({
        title: 'Still offline',
        description:
          'Check the server: sudo systemctl status crm-job-runner',
        variant: 'destructive',
      });
    },
    onError: (error: any) => {
      setAwaitingRestart(false);
      toast({
        title: 'Restart failed',
        description:
          error.response?.data?.error || 'Could not restart job runner',
        variant: 'destructive',
      });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['job-runner-health'] });
  };

  if (collapsed) {
    return (
      <div
        className={cn('flex justify-center py-2', className)}
        title={running ? 'Job Runner: Online' : 'Job Runner: Offline'}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            running ? 'bg-emerald-500' : 'bg-red-500',
            isFetching && 'animate-pulse'
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-secondary/30 p-3 space-y-2',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium truncate">Job Runner</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleRefresh}
          disabled={isFetching}
          title="Refresh status"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full shrink-0',
              running ? 'bg-emerald-500' : 'bg-red-500'
            )}
          />
          <span
            className={cn(
              'text-xs',
              running ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
            )}
          >
            {awaitingRestart
              ? 'Restarting…'
              : running
                ? 'Online'
                : 'Offline'}
          </span>
        </div>

        {canRestart && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                disabled={restartMutation.isPending || awaitingRestart}
              >
                {restartMutation.isPending || awaitingRestart ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restart
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restart job runner?</AlertDialogTitle>
                <AlertDialogDescription>
                  This restarts the Playwright automation service on the server
                  (systemd: crm-job-runner). Any running automation job will be
                  interrupted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => restartMutation.mutate()}>
                  Restart
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
