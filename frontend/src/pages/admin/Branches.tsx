import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, GitBranch, Calendar, Users, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { branchApi, organizationApi } from '@/lib/api';
import { formatDate, isDateExpired } from '@/lib/utils';
import type { Branch, Organization } from '@/types';

export function Branches() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    address: '',
    invoiceAddress: '',
    organizationId: '',
    branchType: 'TVS' as 'TVS' | 'HONDA',
    externalBranchId: '' as string | number,
    countryCode: 'IN',
    dealerId: '' as string | number,
    managerValidUntil: '',
    associateValidUntil: '',
    viewerValidUntil: '',
    insuranceExecutiveValidUntil: '',
    requiresApproval: true,
    allowAssociateJobs: false,
    isActive: true,
  });

  const { data: branchesData, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchApi.getAll(),
  });

  const { data: orgsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => branchApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'Branch created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create branch',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => branchApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'Branch updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update branch',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'Branch deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete branch',
        variant: 'destructive',
      });
    },
  });

  const openDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        code: branch.code,
        description: branch.description || '',
        address: branch.address || '',
        invoiceAddress: branch.invoiceAddress || '',
        organizationId: branch.organizationId,
        branchType: (branch as any).branchType || 'TVS',
        externalBranchId: (branch as any).externalBranchId || '',
        countryCode: (branch as any).countryCode || 'IN',
        dealerId: (branch as any).dealerId || '',
        managerValidUntil: branch.managerValidUntil?.split('T')[0] || '',
        associateValidUntil: branch.associateValidUntil?.split('T')[0] || '',
        viewerValidUntil: branch.viewerValidUntil?.split('T')[0] || '',
        insuranceExecutiveValidUntil: (branch as any).insuranceExecutiveValidUntil?.split('T')[0] || '',
        requiresApproval: branch.requiresApproval,
        allowAssociateJobs: (branch as any).allowAssociateJobs ?? false,
        isActive: branch.isActive,
      });
    } else {
      setEditingBranch(null);
      setFormData({
        name: '',
        code: '',
        description: '',
        address: '',
        invoiceAddress: '',
        organizationId: '',
        branchType: 'TVS',
        externalBranchId: '',
        countryCode: 'IN',
        dealerId: '',
        managerValidUntil: '',
        associateValidUntil: '',
        viewerValidUntil: '',
        insuranceExecutiveValidUntil: '',
        requiresApproval: true,
        allowAssociateJobs: false,
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingBranch(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      address: formData.address || undefined,
      invoiceAddress: formData.invoiceAddress || undefined,
      externalBranchId: formData.externalBranchId ? Number(formData.externalBranchId) : undefined,
      dealerId: formData.dealerId ? Number(formData.dealerId) : undefined,
      managerValidUntil: formData.managerValidUntil || undefined,
      associateValidUntil: formData.associateValidUntil || undefined,
      viewerValidUntil: formData.viewerValidUntil || undefined,
      insuranceExecutiveValidUntil: formData.insuranceExecutiveValidUntil || undefined,
    };
    if (editingBranch) {
      updateMutation.mutate({ id: editingBranch.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const branches = branchesData?.data?.data || [];
  const organizations = orgsData?.data?.data || [];

  const TimelineBadge = ({ date, role }: { date: string | undefined; role: string }) => {
    if (!date) return <Badge variant="outline">{role}: No limit</Badge>;
    const expired = isDateExpired(date);
    return (
      <Badge variant={expired ? 'destructive' : 'success'} className="gap-1">
        <Calendar className="h-3 w-3" />
        {role}: {formatDate(date)}
      </Badge>
    );
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
          <p className="text-muted-foreground">Manage branches and role timelines</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Branch
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
      ) : branches.length === 0 ? (
        <Card className="p-12 text-center">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No branches yet</h3>
          <p className="text-muted-foreground">Create your first branch to get started</p>
          <Button onClick={() => openDialog()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Branch
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 stagger-children">
          {branches.map((branch: Branch) => (
            <Card key={branch.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <GitBranch className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{branch.name}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">{branch.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {branch.organization?.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={branch.isActive ? 'success' : 'secondary'}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant={branch.requiresApproval ? 'info' : 'outline'}>
                    {branch.requiresApproval ? 'Approval Required' : 'Auto-Approve'}
                  </Badge>
                  {(branch as any).allowAssociateJobs && (
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                      Associate Jobs
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {branch.description && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {branch.description}
                  </p>
                )}
                {branch.address && (
                  <p className="text-sm text-muted-foreground mb-2 flex items-start gap-1">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{branch.address}</span>
                  </p>
                )}
                {branch.invoiceAddress && (
                  <p className="text-sm text-muted-foreground mb-4 flex items-start gap-1">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
                    <span><span className="font-medium text-blue-600">Invoice:</span> {branch.invoiceAddress}</span>
                  </p>
                )}
                
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium">Role Timelines:</p>
                  <div className="flex flex-wrap gap-2">
                    <TimelineBadge date={branch.managerValidUntil} role="Manager" />
                    <TimelineBadge date={branch.associateValidUntil} role="Associate" />
                    <TimelineBadge date={branch.viewerValidUntil} role="Viewer" />
                    <TimelineBadge date={(branch as any).insuranceExecutiveValidUntil} role="Ins. Exec" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {branch._count?.users || 0} users
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openDialog(branch)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this branch?')) {
                          deleteMutation.mutate(branch.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Create Branch'}</DialogTitle>
            <DialogDescription>
              {editingBranch ? 'Update branch details and timelines' : 'Add a new branch'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                {!editingBranch && (
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value.toUpperCase() })
                      }
                      required
                    />
                  </div>
                )}
              </div>

              {!editingBranch && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Select
                    value={formData.organizationId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, organizationId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org: Organization) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Branch Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter branch address (displayed to users in sidebar)"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  This address will be displayed to users in their sidebar
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceAddress">Invoice/Billing Address</Label>
                <Textarea
                  id="invoiceAddress"
                  value={formData.invoiceAddress}
                  onChange={(e) => setFormData({ ...formData, invoiceAddress: e.target.value })}
                  placeholder="Enter invoice/billing address for this branch"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  This address will be used for billing and invoice purposes
                </p>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <h4 className="font-medium text-blue-800">External API Integration</h4>
                <p className="text-sm text-blue-600">
                  Configure these settings to fetch data from TVS/Honda APIs
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Branch Type</Label>
                    <Select
                      value={formData.branchType}
                      onValueChange={(value: 'TVS' | 'HONDA') =>
                        setFormData({ ...formData, branchType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TVS">TVS</SelectItem>
                        <SelectItem value="HONDA">HONDA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countryCode">Country Code</Label>
                    <Input
                      id="countryCode"
                      value={formData.countryCode}
                      onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                      placeholder="IN"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dealerId">Dealer ID</Label>
                    <Input
                      id="dealerId"
                      type="number"
                      value={formData.dealerId}
                      onChange={(e) => setFormData({ ...formData, dealerId: e.target.value })}
                      placeholder="e.g., 14719"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="externalBranchId">External Branch ID</Label>
                    <Input
                      id="externalBranchId"
                      type="number"
                      value={formData.externalBranchId}
                      onChange={(e) => setFormData({ ...formData, externalBranchId: e.target.value })}
                      placeholder="e.g., 1"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-secondary/50">
                <h4 className="font-medium">Role Timeline Settings</h4>
                <p className="text-sm text-muted-foreground">
                  Set expiry dates for each role. Users won't be able to login after these dates.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Manager Valid Until</Label>
                    <Input
                      type="date"
                      value={formData.managerValidUntil}
                      onChange={(e) =>
                        setFormData({ ...formData, managerValidUntil: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Associate Valid Until</Label>
                    <Input
                      type="date"
                      value={formData.associateValidUntil}
                      onChange={(e) =>
                        setFormData({ ...formData, associateValidUntil: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Viewer Valid Until</Label>
                    <Input
                      type="date"
                      value={formData.viewerValidUntil}
                      onChange={(e) =>
                        setFormData({ ...formData, viewerValidUntil: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Insurance Executive Valid Until</Label>
                    <Input
                      type="date"
                      value={formData.insuranceExecutiveValidUntil}
                      onChange={(e) =>
                        setFormData({ ...formData, insuranceExecutiveValidUntil: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                <div>
                  <Label>Requires Approval</Label>
                  <p className="text-sm text-muted-foreground">
                    Forms will need manager approval before being finalized
                  </p>
                </div>
                <Switch
                  checked={formData.requiresApproval}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requiresApproval: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div>
                  <Label>Allow Associate Jobs Access</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable to allow Associates to access the Jobs menu
                  </p>
                </div>
                <Switch
                  checked={formData.allowAssociateJobs}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, allowAssociateJobs: checked })
                  }
                />
              </div>

              {editingBranch && (
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <Label>Branch Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {formData.isActive 
                        ? 'Branch is active and users can login' 
                        : 'Branch is inactive - users cannot login'}
                    </p>
                  </div>
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isActive: checked })
                    }
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingBranch ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

