import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users as UsersIcon, Calendar, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { userApi, branchApi } from '@/lib/api';
import { formatDate, isDateExpired, getRoleColor } from '@/lib/utils';
import type { User, Branch } from '@/types';

export function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'ASSOCIATE' as 'MANAGER' | 'ASSOCIATE' | 'VIEWER' | 'INSURANCE_EXECUTIVE',
    branchId: '',
    externalUserId: '' as string | number,
    externalLoginId: '',
    externalRoleId: '' as string | number,
    validUntil: '',
    isActive: true,
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => userApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create user',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete user',
        variant: 'destructive',
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      userApi.resetPassword(id, password),
    onSuccess: () => {
      toast({ title: 'Password reset successfully' });
      setIsPasswordDialogOpen(false);
      setNewPassword('');
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reset password',
        variant: 'destructive',
      });
    },
  });

  const openDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'ASSOCIATE',
        branchId: user.branchId || '',
        externalUserId: (user as any).externalUserId || '',
        externalLoginId: (user as any).externalLoginId || '',
        externalRoleId: (user as any).externalRoleId || '',
        validUntil: user.validUntil?.split('T')[0] || '',
        isActive: user.isActive !== false,
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        role: 'ASSOCIATE',
        branchId: '',
        externalUserId: '',
        externalLoginId: '',
        externalRoleId: '',
        validUntil: '',
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      externalUserId: formData.externalUserId ? Number(formData.externalUserId) : undefined,
      externalLoginId: formData.externalLoginId || undefined,
      externalRoleId: formData.externalRoleId ? Number(formData.externalRoleId) : undefined,
      validUntil: formData.validUntil || undefined,
    };
    if (editingUser) {
      const { password, username, branchId, ...updatePayload } = payload;
      updateMutation.mutate({ id: editingUser.id, data: updatePayload });
    } else {
      // Don't send isActive for new users (defaults to true)
      const { isActive, ...createPayload } = payload;
      createMutation.mutate(createPayload);
    }
  };

  const users = usersData?.data?.data || [];
  const branches = branchesData?.data?.data || [];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Add User
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
      ) : users.length === 0 ? (
        <Card className="p-12 text-center">
          <UsersIcon className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No users yet</h3>
          <p className="text-muted-foreground">Create your first user to get started</p>
          <Button onClick={() => openDialog()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {users.map((user: User) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <UsersIcon className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {user.firstName} {user.lastName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">@{user.username}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Badge variant={user.isActive ? 'success' : 'secondary'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge className={getRoleColor(user.role || '')}>
                    {user.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {user.branch?.name} • {user.branch?.organization?.name}
                  </p>
                  {user.email && (
                    <p className="text-muted-foreground">{user.email}</p>
                  )}
                  {user.validUntil && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span className={isDateExpired(user.validUntil) ? 'text-destructive' : ''}>
                        Valid until: {formatDate(user.validUntil)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingUser(user);
                        setIsPasswordDialogOpen(true);
                      }}
                      className="gap-1"
                    >
                      <Key className="h-3 w-3" />
                      Reset Password
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openDialog(user)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this user?')) {
                          deleteMutation.mutate(user.id);
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

      {/* Create/Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user details' : 'Add a new user to the system'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              {!editingUser && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: 'MANAGER' | 'ASSOCIATE' | 'VIEWER' | 'INSURANCE_EXECUTIVE') =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      <SelectItem value="ASSOCIATE">Associate</SelectItem>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                      <SelectItem value="INSURANCE_EXECUTIVE">Insurance Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!editingUser && (
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select
                      value={formData.branchId}
                      onValueChange={(value) => setFormData({ ...formData, branchId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((branch: Branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name} ({branch.organization?.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Valid Until (Optional)</Label>
                <Input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  User won't be able to login after this date
                </p>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <h4 className="font-medium text-blue-800">External API Integration (TVS/Honda)</h4>
                <p className="text-sm text-blue-600">
                  Configure these to auto-fetch enquiry details from TVS/Honda systems
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>External User ID</Label>
                    <Input
                      type="number"
                      value={formData.externalUserId}
                      onChange={(e) => setFormData({ ...formData, externalUserId: e.target.value })}
                      placeholder="e.g., 266550"
                    />
                    <p className="text-xs text-muted-foreground">
                      UserId for API
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>External Login ID</Label>
                    <Input
                      value={formData.externalLoginId}
                      onChange={(e) => setFormData({ ...formData, externalLoginId: e.target.value })}
                      placeholder="e.g., Admin"
                    />
                    <p className="text-xs text-muted-foreground">
                      LoginId for token
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>External Role ID</Label>
                    <Input
                      type="number"
                      value={formData.externalRoleId}
                      onChange={(e) => setFormData({ ...formData, externalRoleId: e.target.value })}
                      placeholder="e.g., 3"
                    />
                    <p className="text-xs text-muted-foreground">
                      RoleId for token
                    </p>
                  </div>
                </div>
              </div>

              {editingUser && (
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <Label>User Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {formData.isActive 
                        ? 'User is active and can login' 
                        : 'User is inactive - cannot login'}
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
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {editingUser?.firstName} {editingUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setNewPassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingUser && newPassword.length >= 8) {
                  resetPasswordMutation.mutate({ id: editingUser.id, password: newPassword });
                }
              }}
              disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

