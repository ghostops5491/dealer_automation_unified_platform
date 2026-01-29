import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Workflow, ArrowRight, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { flowApi, screenApi, branchApi } from '@/lib/api';
import type { Flow, Screen, Branch, FlowScreen, FlowAssignment } from '@/types';

export function Flows() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isScreenDialogOpen, setIsScreenDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  
  const [flowFormData, setFlowFormData] = useState({ name: '', code: '', description: '' });
  const [screenFormData, setScreenFormData] = useState({ screenId: '', tabName: '' });
  const [assignFormData, setAssignFormData] = useState({
    branchId: '',
    accessibleByManager: true,
    accessibleByAssociate: true,
    accessibleByViewer: true,
  });

  const { data: flowsData, isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.getAll(),
  });

  const { data: screensData } = useQuery({
    queryKey: ['screens'],
    queryFn: () => screenApi.getAll(),
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchApi.getAll(),
  });

  const createFlowMutation = useMutation({
    mutationFn: (data: any) => flowApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Flow created successfully' });
      closeFlowDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => flowApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Flow updated successfully' });
      closeFlowDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const deleteFlowMutation = useMutation({
    mutationFn: (id: string) => flowApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Flow deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const addScreenMutation = useMutation({
    mutationFn: (data: any) => flowApi.addScreen(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Screen added to flow' });
      closeScreenDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const removeScreenMutation = useMutation({
    mutationFn: (flowScreenId: string) => flowApi.removeScreen(flowScreenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Screen removed from flow' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (data: any) => flowApi.assignToBranch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Flow assigned to branch' });
      closeAssignDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => flowApi.unassignFromBranch(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast({ title: 'Flow unassigned from branch' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const openFlowDialog = (flow?: Flow) => {
    if (flow) {
      setEditingFlow(flow);
      setFlowFormData({ name: flow.name, code: flow.code, description: flow.description || '' });
    } else {
      setEditingFlow(null);
      setFlowFormData({ name: '', code: '', description: '' });
    }
    setIsDialogOpen(true);
  };

  const closeFlowDialog = () => {
    setIsDialogOpen(false);
    setEditingFlow(null);
  };

  const openScreenDialog = (flow: Flow) => {
    setSelectedFlow(flow);
    setScreenFormData({ screenId: '', tabName: '' });
    setIsScreenDialogOpen(true);
  };

  const closeScreenDialog = () => {
    setIsScreenDialogOpen(false);
    setSelectedFlow(null);
  };

  const openAssignDialog = (flow: Flow) => {
    setSelectedFlow(flow);
    setAssignFormData({
      branchId: '',
      accessibleByManager: true,
      accessibleByAssociate: true,
      accessibleByViewer: true,
    });
    setIsAssignDialogOpen(true);
  };

  const closeAssignDialog = () => {
    setIsAssignDialogOpen(false);
    setSelectedFlow(null);
  };

  const handleFlowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFlow) {
      updateFlowMutation.mutate({ id: editingFlow.id, data: flowFormData });
    } else {
      createFlowMutation.mutate(flowFormData);
    }
  };

  const handleScreenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tabOrder = selectedFlow?.flowScreens?.length || 0;
    addScreenMutation.mutate({
      flowId: selectedFlow?.id,
      screenId: screenFormData.screenId,
      tabName: screenFormData.tabName,
      tabOrder,
    });
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate({
      flowId: selectedFlow?.id,
      ...assignFormData,
    });
  };

  const flows = flowsData?.data?.data || [];
  const screens = screensData?.data?.data || [];
  const branches = branchesData?.data?.data || [];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Flows</h1>
          <p className="text-muted-foreground">Create workflows by combining screens as tabs</p>
        </div>
        <Button onClick={() => openFlowDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Flow
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted" />
              <CardContent className="h-32 bg-muted/50" />
            </Card>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <Card className="p-12 text-center">
          <Workflow className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No flows yet</h3>
          <p className="text-muted-foreground">Create your first flow to build workflows</p>
          <Button onClick={() => openFlowDialog()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Flow
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 stagger-children">
          {flows.map((flow: Flow) => (
            <Card key={flow.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100">
                    <Workflow className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{flow.name}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">{flow.code}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant={flow.isActive ? 'success' : 'secondary'}>
                    {flow.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => openFlowDialog(flow)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm('Delete this flow?')) deleteFlowMutation.mutate(flow.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {flow.description || 'No description'}
                </p>

                {/* Tabs/Screens */}
                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">Screens (Tabs):</p>
                  {flow.flowScreens && flow.flowScreens.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {flow.flowScreens
                        .sort((a: FlowScreen, b: FlowScreen) => a.tabOrder - b.tabOrder)
                        .map((fs: FlowScreen, index: number) => (
                          <div key={fs.id} className="flex items-center gap-1">
                            <Badge variant="outline" className="gap-1">
                              {fs.tabName}
                              <button
                                onClick={() => removeScreenMutation.mutate(fs.id)}
                                className="ml-1 text-destructive hover:text-destructive"
                              >
                                ×
                              </button>
                            </Badge>
                            {index < (flow.flowScreens?.length || 0) - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No screens added</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => openScreenDialog(flow)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Screen
                  </Button>
                </div>

                {/* Assignments */}
                <div>
                  <p className="text-sm font-medium mb-2">Assigned to:</p>
                  {flow.flowAssignments && flow.flowAssignments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {flow.flowAssignments.map((fa: FlowAssignment) => (
                        <Badge key={fa.id} variant="secondary" className="gap-1">
                          {fa.branch?.name}
                          <button
                            onClick={() => unassignMutation.mutate(fa.id)}
                            className="ml-1 text-destructive hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not assigned to any branch</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => openAssignDialog(flow)}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Assign to Branch
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flow Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFlow ? 'Edit Flow' : 'Create Flow'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFlowSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={flowFormData.name}
                  onChange={(e) => setFlowFormData({ ...flowFormData, name: e.target.value })}
                  required
                />
              </div>
              {!editingFlow && (
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input
                    value={flowFormData.code}
                    onChange={(e) =>
                      setFlowFormData({ ...flowFormData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })
                    }
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={flowFormData.description}
                  onChange={(e) => setFlowFormData({ ...flowFormData, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFlowDialog}>Cancel</Button>
              <Button type="submit">{editingFlow ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Screen Dialog */}
      <Dialog open={isScreenDialogOpen} onOpenChange={setIsScreenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Screen to Flow</DialogTitle>
            <DialogDescription>Select a screen and give it a tab name</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScreenSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Screen</Label>
                <Select
                  value={screenFormData.screenId}
                  onValueChange={(value) => setScreenFormData({ ...screenFormData, screenId: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a screen" /></SelectTrigger>
                  <SelectContent>
                    {screens.map((screen: Screen) => (
                      <SelectItem key={screen.id} value={screen.id}>
                        {screen.name} ({screen.fields?.length || 0} fields)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tab Name</Label>
                <Input
                  value={screenFormData.tabName}
                  onChange={(e) => setScreenFormData({ ...screenFormData, tabName: e.target.value })}
                  placeholder="e.g., Personal Info"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeScreenDialog}>Cancel</Button>
              <Button type="submit">Add Screen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign to Branch Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Flow to Branch</DialogTitle>
            <DialogDescription>Select branch and configure role access</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={assignFormData.branchId}
                  onValueChange={(value) => setAssignFormData({ ...assignFormData, branchId: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((branch: Branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.organization?.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role Access</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={assignFormData.accessibleByManager}
                      onCheckedChange={(c) => setAssignFormData({ ...assignFormData, accessibleByManager: c as boolean })}
                    />
                    <span>Managers can access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={assignFormData.accessibleByAssociate}
                      onCheckedChange={(c) => setAssignFormData({ ...assignFormData, accessibleByAssociate: c as boolean })}
                    />
                    <span>Associates can access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={assignFormData.accessibleByViewer}
                      onCheckedChange={(c) => setAssignFormData({ ...assignFormData, accessibleByViewer: c as boolean })}
                    />
                    <span>Viewers can access</span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAssignDialog}>Cancel</Button>
              <Button type="submit">Assign</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

