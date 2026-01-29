import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Workflow, ArrowRight, Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth';
import { flowApi } from '@/lib/api';
import type { Flow, FlowScreen } from '@/types';

export function UserFlows() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['my-flows'],
    queryFn: () => flowApi.getMyFlows(),
  });

  const flows = data?.data?.data || [];
  const isViewer = user?.role === 'VIEWER';

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="h-24 bg-muted" />
            <CardContent className="h-20 bg-muted/50" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Available Flows</h1>
        <p className="text-muted-foreground">Start a new form submission from available flows</p>
      </div>

      {flows.length === 0 ? (
        <Card className="p-12 text-center">
          <Workflow className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No flows available</h3>
          <p className="text-muted-foreground">
            No flows have been assigned to your branch yet. Please contact your administrator.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {flows.map((flow: Flow) => (
            <Card key={flow.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100">
                    <Workflow className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{flow.name}</CardTitle>
                    <CardDescription>{flow.description || 'No description'}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">Steps:</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {flow.flowScreens
                      ?.sort((a: FlowScreen, b: FlowScreen) => a.tabOrder - b.tabOrder)
                      .map((fs: FlowScreen, index: number) => (
                        <div key={fs.id} className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {index + 1}. {fs.tabName}
                          </Badge>
                          {index < (flow.flowScreens?.length || 0) - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => navigate(`/dashboard/flows/${flow.id}/new`)}
                  disabled={isViewer}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isViewer ? 'View Only' : 'Start Flow'}
                </Button>

                {isViewer && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Viewers cannot start new submissions
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

