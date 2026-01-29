import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, Trash2, Car, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/hooks/use-toast';
import { vehicleCatalogApi } from '@/lib/api';

interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  variant: string;
  colour: string;
  fuelType: string;
}

interface CatalogSummary {
  totalEntries: number;
  uniqueBrands: number;
  uniqueModels: number;
  uniqueVariants: number;
}

export function VehicleCatalog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    status: 'idle' | 'uploading' | 'success' | 'error';
    message?: string;
    imported?: number;
    errors?: string[];
  }>({ status: 'idle' });

  // Fetch catalog summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['vehicle-catalog-summary'],
    queryFn: () => vehicleCatalogApi.getSummary(),
  });

  // Fetch full catalog
  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['vehicle-catalog'],
    queryFn: () => vehicleCatalogApi.getAll(),
  });

  const summary: CatalogSummary = summaryData?.data?.data || {
    totalEntries: 0,
    uniqueBrands: 0,
    uniqueModels: 0,
    uniqueVariants: 0,
  };

  const catalog: CatalogEntry[] = catalogData?.data?.data || [];

  // Upload CSV mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => vehicleCatalogApi.uploadCsv(file),
    onSuccess: (response) => {
      const data = response.data;
      if (data.success) {
        setUploadProgress({
          status: 'success',
          message: data.message,
          imported: data.data?.imported,
          errors: data.data?.errors,
        });
        queryClient.invalidateQueries({ queryKey: ['vehicle-catalog'] });
        queryClient.invalidateQueries({ queryKey: ['vehicle-catalog-summary'] });
        toast({ title: 'Upload successful', description: data.message });
      } else {
        setUploadProgress({
          status: 'error',
          message: data.error,
          errors: data.data?.errors,
        });
        toast({ title: 'Upload failed', description: data.error, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || 'Failed to upload CSV';
      setUploadProgress({
        status: 'error',
        message: errorMsg,
        errors: error.response?.data?.data?.errors,
      });
      toast({ title: 'Upload failed', description: errorMsg, variant: 'destructive' });
    },
  });

  // Delete catalog mutation
  const deleteMutation = useMutation({
    mutationFn: () => vehicleCatalogApi.deleteAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-catalog-summary'] });
      toast({ title: 'Catalog deleted', description: 'All catalog entries have been removed' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Delete failed', 
        description: error.response?.data?.error || 'Failed to delete catalog', 
        variant: 'destructive' 
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({ title: 'Invalid file', description: 'Please select a CSV file', variant: 'destructive' });
        return;
      }
      setUploadProgress({ status: 'uploading', message: 'Uploading and processing CSV...' });
      uploadMutation.mutate(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await vehicleCatalogApi.downloadTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vehicle-catalog-template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Template downloaded' });
    } catch (error) {
      toast({ title: 'Download failed', description: 'Failed to download template', variant: 'destructive' });
    }
  };

  // Group catalog by brand for display
  const groupedCatalog = catalog.reduce((acc, entry) => {
    if (!acc[entry.brand]) {
      acc[entry.brand] = [];
    }
    acc[entry.brand].push(entry);
    return acc;
  }, {} as Record<string, CatalogEntry[]>);

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="h-6 w-6" />
            Vehicle Catalog
          </h1>
          <p className="text-muted-foreground">
            Manage vehicle data for cascading dropdowns (Brand → Model → Variant → Colour → Fuel Type)
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : summary.totalEntries}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : summary.uniqueBrands}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : summary.uniqueModels}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : summary.uniqueVariants}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload Vehicle Catalog CSV
          </CardTitle>
          <CardDescription>
            Upload a CSV file with columns: Brand, Model, Variant, Colour, Fuel Type.
            This will replace all existing catalog entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload CSV
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            {summary.totalEntries > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Vehicle Catalog?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {summary.totalEntries} catalog entries. 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Upload Progress/Status */}
          {uploadProgress.status !== 'idle' && (
            <div className={`p-4 rounded-lg border ${
              uploadProgress.status === 'uploading' ? 'bg-blue-50 border-blue-200' :
              uploadProgress.status === 'success' ? 'bg-green-50 border-green-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {uploadProgress.status === 'uploading' && (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                )}
                {uploadProgress.status === 'success' && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                {uploadProgress.status === 'error' && (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  uploadProgress.status === 'uploading' ? 'text-blue-700' :
                  uploadProgress.status === 'success' ? 'text-green-700' :
                  'text-red-700'
                }`}>
                  {uploadProgress.message}
                </span>
              </div>
              {uploadProgress.imported && (
                <p className="text-sm text-green-600 mt-1">
                  Successfully imported {uploadProgress.imported} entries
                </p>
              )}
              {uploadProgress.errors && uploadProgress.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-700">Errors:</p>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {uploadProgress.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {uploadProgress.errors.length > 5 && (
                      <li>...and {uploadProgress.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* CSV Format Info */}
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">CSV Format Requirements:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Header row with columns: <code className="bg-background px-1 rounded">Brand, Model, Variant, Colour, Fuel Type</code></li>
              <li>• Each row represents one valid combination</li>
              <li>• For a brand to show a model, include a row with that brand-model pair</li>
              <li>• The cascading works: Brand → Model → Variant → Colour → Fuel Type</li>
            </ul>
            <div className="mt-3 p-3 bg-background rounded border font-mono text-xs">
              Brand,Model,Variant,Colour,Fuel Type<br/>
              Maruti Suzuki,Swift,ZXi Plus,Pearl Arctic White,Petrol<br/>
              Maruti Suzuki,Swift,ZXi,Pearl Arctic White,Petrol<br/>
              Hyundai,Creta,SX (O),Titan Grey,Diesel
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Catalog Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Catalog</CardTitle>
          <CardDescription>
            {summary.totalEntries} entries across {summary.uniqueBrands} brands
          </CardDescription>
        </CardHeader>
        <CardContent>
          {catalogLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : catalog.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No vehicle catalog entries yet.</p>
              <p className="text-sm">Upload a CSV file to get started.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedCatalog).map(([brand, entries]) => (
                <div key={brand} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 font-medium flex items-center justify-between">
                    <span>{brand}</span>
                    <Badge variant="secondary">{entries.length} entries</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Colour</TableHead>
                        <TableHead>Fuel Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.slice(0, 10).map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.model}</TableCell>
                          <TableCell>{entry.variant}</TableCell>
                          <TableCell>{entry.colour}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.fuelType}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {entries.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            ...and {entries.length - 10} more entries
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
