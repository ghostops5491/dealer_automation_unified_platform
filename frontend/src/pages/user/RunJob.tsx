import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Square, 
  RefreshCw, 
  Terminal, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  FileText,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Job {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  duration: number;
}

interface JobStatus {
  success: boolean;
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  output: string;
  startTime: string;
  duration: number;
}

export default function RunJob() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobOutput, setJobOutput] = useState<string>('');
  const outputRef = useRef<HTMLPreElement>(null);

  // Fetch all jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobApi.getAllJobs(),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch selected job status
  const { data: jobStatusData } = useQuery({
    queryKey: ['job-status', selectedJob],
    queryFn: () => (selectedJob ? jobApi.getJobStatus(selectedJob) : null),
    enabled: !!selectedJob,
    refetchInterval: selectedJob ? 2000 : false, // Refresh every 2 seconds when job selected
  });

  // Update job output when status changes
  useEffect(() => {
    if (jobStatusData?.data) {
      setJobOutput(jobStatusData.data.output || '');
      // Auto-scroll to bottom
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }
  }, [jobStatusData]);

  // Run job for all entries
  const runAllMutation = useMutation({
    mutationFn: () => jobApi.runAllEntries(),
    onSuccess: (response) => {
      toast({
        title: 'Job Started',
        description: `Job for all entries started (ID: ${response.data.jobId})`,
      });
      setSelectedJob(response.data.jobId);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to start job',
        variant: 'destructive',
      });
    },
  });

  // Run job for last entry
  const runLastMutation = useMutation({
    mutationFn: () => jobApi.runLastEntry(),
    onSuccess: (response) => {
      toast({
        title: 'Job Started',
        description: `Job for last entry started (ID: ${response.data.jobId})`,
      });
      setSelectedJob(response.data.jobId);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to start job',
        variant: 'destructive',
      });
    },
  });

  // Stop job
  const stopMutation = useMutation({
    mutationFn: (jobId: string) => jobApi.stopJob(jobId),
    onSuccess: () => {
      toast({
        title: 'Job Stopped',
        description: 'The job has been stopped',
      });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job-status', selectedJob] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to stop job',
        variant: 'destructive',
      });
    },
  });

  const jobs: Job[] = jobsData?.data?.jobs || [];

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isAnyJobRunning = jobs.some(j => j.status === 'running');
  const currentJobStatus = jobStatusData?.data as JobStatus | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Run Job</h1>
        <p className="text-muted-foreground">
          Execute Robot Framework automation tests for form filling
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Run for All Entries */}
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Run Job for All Entries
            </CardTitle>
            <CardDescription>
              Execute the automation test for all pending entries in the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending || isAnyJobRunning}
              className="w-full"
              size="lg"
            >
              {runAllMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run All Entries
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Run for Last Entry */}
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-600" />
              Run Job for Last Entry
            </CardTitle>
            <CardDescription>
              Execute the automation test for only the last/most recent entry
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => runLastMutation.mutate()}
              disabled={runLastMutation.isPending || isAnyJobRunning}
              className="w-full"
              variant="secondary"
              size="lg"
            >
              {runLastMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Last Entry
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List & Output */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Jobs List */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Job History</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['jobs'] })}
            >
              <RefreshCw className={cn("h-4 w-4", jobsLoading && "animate-spin")} />
            </Button>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No jobs have been run yet
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {jobs.map((job) => (
                  <div
                    key={job.jobId}
                    onClick={() => setSelectedJob(job.jobId)}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedJob === job.jobId
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        {job.jobId.split('_')[1]}
                      </span>
                      {getStatusBadge(job.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(job.startTime).toLocaleTimeString()}
                      <span>•</span>
                      {formatDuration(job.duration)}
                    </div>
                    {job.status === 'running' && selectedJob === job.jobId && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          stopMutation.mutate(job.jobId);
                        }}
                        disabled={stopMutation.isPending}
                      >
                        <Square className="mr-2 h-3 w-3" />
                        Stop Job
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Console Output */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Console Output
            </CardTitle>
            {currentJobStatus && (
              <div className="flex items-center gap-2">
                {getStatusBadge(currentJobStatus.status)}
                <span className="text-xs text-muted-foreground">
                  {formatDuration(currentJobStatus.duration)}
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <pre
              ref={outputRef}
              className="bg-zinc-950 text-zinc-100 p-4 rounded-lg font-mono text-sm overflow-auto h-[400px] whitespace-pre-wrap"
            >
              {selectedJob ? (
                jobOutput || (
                  <span className="text-zinc-500">Waiting for output...</span>
                )
              ) : (
                <span className="text-zinc-500">
                  Select a job from the list or start a new job to see output
                </span>
              )}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Command Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-medium text-amber-800 mb-2">⚠️ Job Runner Service Required</p>
              <p className="text-sm text-amber-700 mb-2">
                Before running jobs, start the Job Runner service on your Windows machine:
              </p>
              <code className="block bg-amber-100 px-3 py-2 rounded text-sm font-mono">
                python C:\Users\yashc\Desktop\Auto_Unified_Platform\job_runner\job_runner.py
              </code>
            </div>
            
            <div className="space-y-2 font-mono text-sm">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground">Working Directory:</span>
                <code className="bg-muted px-2 py-0.5 rounded">
                  C:\Users\yashc\Desktop\Auto_Unified_Platform\form_filling
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground">Command:</span>
                <code className="bg-muted px-2 py-0.5 rounded">
                  python -m robot --test "Fill TVS Page" tests/fill_form.robot
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

