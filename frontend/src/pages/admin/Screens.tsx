import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, LayoutGrid, GripVertical, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
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
import { screenApi } from '@/lib/api';
import type { Screen, ScreenField, FieldType } from '@/types';

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Text Area' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date & Time' },
  { value: 'SELECT', label: 'Select Dropdown' },
  { value: 'MULTISELECT', label: 'Multi Select' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'RADIO', label: 'Radio Buttons' },
];

export function Screens() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [editingScreen, setEditingScreen] = useState<Screen | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);
  const [editingField, setEditingField] = useState<ScreenField | null>(null);
  
  const [screenFormData, setScreenFormData] = useState({ 
    name: '', 
    code: '', 
    description: '', 
    requiresApproval: false,
    requiresInsuranceApproval: false,
    isPostApproval: false,
  });
  const [fieldFormData, setFieldFormData] = useState({
    name: '',
    label: '',
    fieldType: 'TEXT' as FieldType,
    placeholder: '',
    defaultValue: '',
    isRequired: false,
    validationRegex: '',
    validationMessage: '',
    minLength: '',
    maxLength: '',
    minValue: '',
    maxValue: '',
    options: '',
    conditionalField: '',
    conditionalValue: '',
    visibleToManager: true,
    visibleToAssociate: true,
    visibleToViewer: true,
    editableByManager: true,
    editableByAssociate: true,
    editableByViewer: false,
  });

  const { data: screensData, isLoading } = useQuery({
    queryKey: ['screens'],
    queryFn: () => screenApi.getAll(),
  });

  const createScreenMutation = useMutation({
    mutationFn: (data: any) => screenApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Screen created successfully' });
      closeScreenDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const updateScreenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => screenApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Screen updated successfully' });
      closeScreenDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const deleteScreenMutation = useMutation({
    mutationFn: (id: string) => screenApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Screen deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const addFieldMutation = useMutation({
    mutationFn: (data: any) => screenApi.addField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Field added successfully' });
      closeFieldDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: any }) =>
      screenApi.updateField(fieldId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Field updated successfully' });
      closeFieldDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => screenApi.deleteField(fieldId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      toast({ title: 'Field deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const openScreenDialog = (screen?: Screen) => {
    if (screen) {
      setEditingScreen(screen);
      setScreenFormData({ 
        name: screen.name, 
        code: screen.code, 
        description: screen.description || '',
        requiresApproval: screen.requiresApproval || false,
        requiresInsuranceApproval: screen.requiresInsuranceApproval || false,
        isPostApproval: screen.isPostApproval || false,
      });
    } else {
      setEditingScreen(null);
      setScreenFormData({ 
        name: '', 
        code: '', 
        description: '', 
        requiresApproval: false,
        requiresInsuranceApproval: false,
        isPostApproval: false,
      });
    }
    setIsDialogOpen(true);
  };

  const closeScreenDialog = () => {
    setIsDialogOpen(false);
    setEditingScreen(null);
  };

  const openFieldDialog = (screen: Screen, field?: ScreenField) => {
    setSelectedScreen(screen);
    if (field) {
      setEditingField(field);
      const options = field.options ? JSON.parse(field.options).map((o: any) => `${o.value}:${o.label}`).join('\n') : '';
      setFieldFormData({
        name: field.name,
        label: field.label,
        fieldType: field.fieldType,
        placeholder: field.placeholder || '',
        defaultValue: field.defaultValue || '',
        isRequired: field.isRequired,
        validationRegex: field.validationRegex || '',
        validationMessage: field.validationMessage || '',
        minLength: field.minLength?.toString() || '',
        maxLength: field.maxLength?.toString() || '',
        minValue: field.minValue?.toString() || '',
        maxValue: field.maxValue?.toString() || '',
        options,
        conditionalField: field.conditionalField || '',
        conditionalValue: field.conditionalValue || '',
        visibleToManager: field.visibleToManager,
        visibleToAssociate: field.visibleToAssociate,
        visibleToViewer: field.visibleToViewer,
        editableByManager: field.editableByManager,
        editableByAssociate: field.editableByAssociate,
        editableByViewer: field.editableByViewer,
      });
    } else {
      setEditingField(null);
      setFieldFormData({
        name: '',
        label: '',
        fieldType: 'TEXT',
        placeholder: '',
        defaultValue: '',
        isRequired: false,
        validationRegex: '',
        validationMessage: '',
        minLength: '',
        maxLength: '',
        minValue: '',
        maxValue: '',
        options: '',
        conditionalField: '',
        conditionalValue: '',
        visibleToManager: true,
        visibleToAssociate: true,
        visibleToViewer: true,
        editableByManager: true,
        editableByAssociate: true,
        editableByViewer: false,
      });
    }
    setIsFieldDialogOpen(true);
  };

  const closeFieldDialog = () => {
    setIsFieldDialogOpen(false);
    setSelectedScreen(null);
    setEditingField(null);
  };

  const handleScreenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScreen) {
      updateScreenMutation.mutate({ id: editingScreen.id, data: screenFormData });
    } else {
      createScreenMutation.mutate(screenFormData);
    }
  };

  const handleFieldSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const options = fieldFormData.options
      ? fieldFormData.options.split('\n').filter(Boolean).map((line) => {
          const [value, label] = line.split(':');
          return { value: value.trim(), label: (label || value).trim() };
        })
      : undefined;

    const payload = {
      ...fieldFormData,
      screenId: selectedScreen?.id,
      minLength: fieldFormData.minLength ? parseInt(fieldFormData.minLength) : undefined,
      maxLength: fieldFormData.maxLength ? parseInt(fieldFormData.maxLength) : undefined,
      minValue: fieldFormData.minValue ? parseFloat(fieldFormData.minValue) : undefined,
      maxValue: fieldFormData.maxValue ? parseFloat(fieldFormData.maxValue) : undefined,
      options,
    };

    if (editingField) {
      updateFieldMutation.mutate({ fieldId: editingField.id, data: payload });
    } else {
      addFieldMutation.mutate(payload);
    }
  };

  const screens = screensData?.data?.data || [];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Screens</h1>
          <p className="text-muted-foreground">Build form screens with custom fields</p>
        </div>
        <Button onClick={() => openScreenDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Screen
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20 bg-muted" />
            </Card>
          ))}
        </div>
      ) : screens.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No screens yet</h3>
          <p className="text-muted-foreground">Create your first screen to build forms</p>
          <Button onClick={() => openScreenDialog()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Screen
          </Button>
        </Card>
      ) : (
        <div className="space-y-4 stagger-children">
          {screens.map((screen: Screen) => (
            <Card key={screen.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100">
                    <LayoutGrid className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{screen.name}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">{screen.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={screen.isActive ? 'success' : 'secondary'}>
                    {screen.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {screen.requiresApproval && (
                    <Badge variant="default" className="gap-1 bg-amber-500 hover:bg-amber-600">
                      <ShieldCheck className="h-3 w-3" />
                      Manager Approval
                    </Badge>
                  )}
                  {screen.requiresInsuranceApproval && (
                    <Badge variant="default" className="gap-1 bg-blue-500 hover:bg-blue-600">
                      <ShieldCheck className="h-3 w-3" />
                      Insurance Approval
                    </Badge>
                  )}
                  {screen.isPostApproval && (
                    <Badge variant="default" className="gap-1 bg-purple-500 hover:bg-purple-600">
                      Post-Approval
                    </Badge>
                  )}
                  <Badge variant="outline">{screen.fields?.length || 0} fields</Badge>
                  <Button variant="ghost" size="icon" onClick={() => openScreenDialog(screen)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm('Delete this screen?')) deleteScreenMutation.mutate(screen.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {screen.fields && screen.fields.length > 0 ? (
                    screen.fields.map((field: ScreenField) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{field.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {field.name} • {field.fieldType}
                              {field.isRequired && ' • Required'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openFieldDialog(screen, field)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm('Delete this field?')) deleteFieldMutation.mutate(field.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No fields added yet
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => openFieldDialog(screen)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Screen Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingScreen ? 'Edit Screen' : 'Create Screen'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleScreenSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={screenFormData.name}
                  onChange={(e) => setScreenFormData({ ...screenFormData, name: e.target.value })}
                  required
                />
              </div>
              {!editingScreen && (
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input
                    value={screenFormData.code}
                    onChange={(e) =>
                      setScreenFormData({ ...screenFormData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })
                    }
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={screenFormData.description}
                  onChange={(e) => setScreenFormData({ ...screenFormData, description: e.target.value })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <div className="space-y-1">
                  <Label className="text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Requires Manager Approval
                  </Label>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    When enabled, submissions containing this screen will require manager approval before being finalized.
                  </p>
                </div>
                <Switch
                  checked={screenFormData.requiresApproval}
                  onCheckedChange={(checked) => setScreenFormData({ ...screenFormData, requiresApproval: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                <div className="space-y-1">
                  <Label className="text-blue-900 dark:text-blue-100 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Requires Insurance Executive Approval
                  </Label>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    When enabled, submissions containing this screen will require Insurance Executive approval first.
                  </p>
                </div>
                <Switch
                  checked={screenFormData.requiresInsuranceApproval}
                  onCheckedChange={(checked) => setScreenFormData({ ...screenFormData, requiresInsuranceApproval: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                <div className="space-y-1">
                  <Label className="text-purple-900 dark:text-purple-100 flex items-center gap-2">
                    Post-Approval Screen
                  </Label>
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    When enabled, this screen can only be accessed/printed after the submission is fully approved.
                  </p>
                </div>
                <Switch
                  checked={screenFormData.isPostApproval}
                  onCheckedChange={(checked) => setScreenFormData({ ...screenFormData, isPostApproval: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeScreenDialog}>Cancel</Button>
              <Button type="submit">{editingScreen ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Field Dialog */}
      <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit Field' : 'Add Field'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFieldSubmit}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field Name (key)</Label>
                  <Input
                    value={fieldFormData.name}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, name: e.target.value.replace(/\s+/g, '_') })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={fieldFormData.label}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, label: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field Type</Label>
                  <Select
                    value={fieldFormData.fieldType}
                    onValueChange={(value: FieldType) => setFieldFormData({ ...fieldFormData, fieldType: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fieldTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Placeholder</Label>
                  <Input
                    value={fieldFormData.placeholder}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, placeholder: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={fieldFormData.isRequired}
                    onCheckedChange={(checked) =>
                      setFieldFormData({ ...fieldFormData, isRequired: checked as boolean })
                    }
                  />
                  <Label>Required</Label>
                </div>
              </div>

              {['SELECT', 'MULTISELECT', 'RADIO'].includes(fieldFormData.fieldType) && (
                <div className="space-y-2">
                  <Label>Options (one per line, format: value:label)</Label>
                  <Textarea
                    value={fieldFormData.options}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, options: e.target.value })}
                    placeholder="option1:Option 1&#10;option2:Option 2"
                    rows={4}
                  />
                </div>
              )}

              <div className="space-y-2 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <Label className="text-amber-700 dark:text-amber-400">Conditional Visibility (Optional)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Show this field only when another field has a specific value. Use "SCREEN_CODE.field_name" for cross-screen references.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Depends On Field</Label>
                    <Input
                      value={fieldFormData.conditionalField}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, conditionalField: e.target.value })}
                      placeholder="e.g., CUSTOMER_ENQUIRY.ownership_type"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Show When Value Is</Label>
                    <Input
                      value={fieldFormData.conditionalValue}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, conditionalValue: e.target.value })}
                      placeholder="e.g., individual or company"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-secondary/50">
                <Label>Validation (Optional)</Label>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Regex Pattern</Label>
                    <Input
                      value={fieldFormData.validationRegex}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, validationRegex: e.target.value })}
                      placeholder="^[a-zA-Z]+$"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Error Message</Label>
                    <Input
                      value={fieldFormData.validationMessage}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, validationMessage: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-secondary/50">
                <Label>Role Permissions</Label>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Manager</p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.visibleToManager}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, visibleToManager: c as boolean })}
                      />
                      <span className="text-xs">Visible</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.editableByManager}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, editableByManager: c as boolean })}
                      />
                      <span className="text-xs">Editable</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Associate</p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.visibleToAssociate}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, visibleToAssociate: c as boolean })}
                      />
                      <span className="text-xs">Visible</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.editableByAssociate}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, editableByAssociate: c as boolean })}
                      />
                      <span className="text-xs">Editable</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Viewer</p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.visibleToViewer}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, visibleToViewer: c as boolean })}
                      />
                      <span className="text-xs">Visible</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={fieldFormData.editableByViewer}
                        onCheckedChange={(c) => setFieldFormData({ ...fieldFormData, editableByViewer: c as boolean })}
                      />
                      <span className="text-xs">Editable</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFieldDialog}>Cancel</Button>
              <Button type="submit">{editingField ? 'Update' : 'Add'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

