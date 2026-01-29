import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Building2, X, MapPin, FileText } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { organizationApi, uploadApi } from '@/lib/api';
import type { Organization } from '@/types';

export function Organizations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    code: '', 
    description: '', 
    logo: '',
    legalName: '',
    ownerName: '',
    address: '',
    gstNumber: '',
    panNumber: '',
    isActive: true,
  });
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof organizationApi.create>[0]) =>
      organizationApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast({ title: 'Organization created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create organization',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      organizationApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast({ title: 'Organization updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update organization',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => organizationApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast({ title: 'Organization deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete organization',
        variant: 'destructive',
      });
    },
  });

  const openDialog = (org?: Organization) => {
    if (org) {
      setEditingOrg(org);
      setFormData({ 
        name: org.name, 
        code: org.code, 
        description: org.description || '', 
        logo: org.logo || '',
        legalName: org.legalName || '',
        ownerName: org.ownerName || '',
        address: org.address || '',
        gstNumber: org.gstNumber || '',
        panNumber: org.panNumber || '',
        isActive: org.isActive,
      });
    } else {
      setEditingOrg(null);
      setFormData({ 
        name: '', 
        code: '', 
        description: '', 
        logo: '',
        legalName: '',
        ownerName: '',
        address: '',
        gstNumber: '',
        panNumber: '',
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingOrg(null);
    setFormData({ 
      name: '', 
      code: '', 
      description: '', 
      logo: '',
      legalName: '',
      ownerName: '',
      address: '',
      gstNumber: '',
      panNumber: '',
      isActive: true,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, GIF, or WebP image',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Logo must be less than 2MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const response = await uploadApi.uploadFile(file);
      const url = response.data?.data?.url;
      if (url) {
        setFormData({ ...formData, logo: url });
        toast({ title: 'Logo uploaded successfully' });
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.response?.data?.error || 'Failed to upload logo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => {
    setFormData({ ...formData, logo: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrg) {
      updateMutation.mutate({
        id: editingOrg.id,
        data: { 
          name: formData.name, 
          description: formData.description || null,
          logo: formData.logo || null,
          legalName: formData.legalName || null,
          ownerName: formData.ownerName || null,
          address: formData.address || null,
          gstNumber: formData.gstNumber || null,
          panNumber: formData.panNumber || null,
          isActive: formData.isActive,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        code: formData.code,
        description: formData.description || undefined,
        logo: formData.logo || undefined,
        legalName: formData.legalName || undefined,
        ownerName: formData.ownerName || undefined,
        address: formData.address || undefined,
        gstNumber: formData.gstNumber || undefined,
        panNumber: formData.panNumber || undefined,
      });
    }
  };

  const organizations = data?.data?.data || [];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">Manage your organizations</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Organization
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted" />
              <CardContent className="h-20 bg-muted/50" />
            </Card>
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No organizations yet</h3>
          <p className="text-muted-foreground">Create your first organization to get started</p>
          <Button onClick={() => openDialog()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Organization
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {organizations.map((org: Organization) => (
            <Card key={org.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  {org.logo ? (
                    <img 
                      src={org.logo} 
                      alt={org.name}
                      className="h-10 w-10 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">{org.name}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">{org.code}</p>
                  </div>
                </div>
                <Badge variant={org.isActive ? 'success' : 'secondary'}>
                  {org.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CardHeader>
              <CardContent>
                {org.legalName && (
                  <p className="text-sm text-muted-foreground mb-1">
                    <span className="font-medium">Legal:</span> {org.legalName}
                  </p>
                )}
                {org.ownerName && (
                  <p className="text-sm text-muted-foreground mb-1">
                    <span className="font-medium">Owner:</span> {org.ownerName}
                  </p>
                )}
                {org.address && (
                  <p className="text-sm text-muted-foreground mb-1 flex items-start gap-1">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-1">{org.address}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 my-2">
                  {org.gstNumber && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      GST: {org.gstNumber}
                    </Badge>
                  )}
                  {org.panNumber && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      PAN: {org.panNumber}
                    </Badge>
                  )}
                </div>
                {org.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {org.description}
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    {org._count?.branches || 0} branches
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openDialog(org)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this organization?')) {
                          deleteMutation.mutate(org.id);
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOrg ? 'Edit Organization' : 'Create Organization'}
            </DialogTitle>
            <DialogDescription>
              {editingOrg
                ? 'Update organization details'
                : 'Add a new organization to the system'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Organization display name"
                    required
                  />
                </div>
                {!editingOrg && (
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value.toUpperCase() })
                      }
                      placeholder="ORG001"
                      required
                    />
                  </div>
                )}
                {editingOrg && (
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input value={editingOrg.code} disabled className="bg-muted" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="legalName">Legal Name</Label>
                <Input
                  id="legalName"
                  value={formData.legalName}
                  onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                  placeholder="Organization legal name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner / Ownership Name</Label>
                <Input
                  id="ownerName"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  placeholder="Owner or proprietor name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Complete organization address"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>
                  <Input
                    id="gstNumber"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="panNumber">PAN Number</Label>
                  <Input
                    id="panNumber"
                    value={formData.panNumber}
                    onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                    placeholder="AAAAA0000A"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description about the organization"
                  rows={2}
                />
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo</Label>
                {formData.logo ? (
                  <div className="flex items-center gap-4">
                    <img 
                      src={formData.logo} 
                      alt="Organization logo"
                      className="h-16 w-16 rounded-lg object-cover border"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={removeLogo}
                      className="text-destructive"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                      className="cursor-pointer"
                    />
                    {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a logo (JPEG, PNG, GIF, WebP - max 2MB)
                </p>
              </div>

              {/* Active Status */}
              {editingOrg && (
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <Label>Organization Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {formData.isActive 
                        ? 'Organization is active' 
                        : 'Organization is inactive - all branches and users disabled'}
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
                {editingOrg ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

