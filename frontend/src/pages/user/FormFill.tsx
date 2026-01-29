import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Save, Send, Check, Loader2, Printer, Download, Search, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/ui/file-upload';
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
import { useAuthStore } from '@/store/auth';
import { flowApi, formApi, externalApi, jobApi, vehicleCatalogApi } from '@/lib/api';
import { parseOptions, cn } from '@/lib/utils';
import type { FormSubmission, ScreenField, FlowScreen } from '@/types';

// Define which fields are cascading vehicle fields
const CASCADING_VEHICLE_FIELDS = ['brand', 'model', 'variant', 'color', 'fuel_type'];
const VEHICLE_FIELD_DEPENDENCIES: Record<string, string[]> = {
  brand: [],
  model: ['brand'],
  variant: ['brand', 'model'],
  color: ['brand', 'model', 'variant'],
  fuel_type: ['brand', 'model', 'variant', 'color'],
};

export function FormFill() {
  const { flowId, submissionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [currentTab, setCurrentTab] = useState(0);
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Fetch Details state
  const [isFetchDialogOpen, setIsFetchDialogOpen] = useState(false);
  const [fetchSearchType, setFetchSearchType] = useState<'enquiry' | 'mobile'>('mobile');
  const [fetchSearchValue, setFetchSearchValue] = useState('');
  const [fetchAuthToken, setFetchAuthToken] = useState('');
  const [fetchResults, setFetchResults] = useState<any[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchedEnquiryNo, setFetchedEnquiryNo] = useState<string | null>(null);
  
  // Booking Job state
  const [, setBookingJobId] = useState<string | null>(null);
  const [bookingJobStatus, setBookingJobStatus] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  
  // Enquiry Job state
  const [, setEnquiryJobId] = useState<string | null>(null);
  const [enquiryJobStatus, setEnquiryJobStatus] = useState<string | null>(null);
  const [enquiryLoading, setEnquiryLoading] = useState(false);

  // Cascading vehicle dropdown state
  const [vehicleCatalogOptions, setVehicleCatalogOptions] = useState<{
    brands: string[];
    models: string[];
    variants: string[];
    colors: string[];
    fuelTypes: string[];
  }>({
    brands: [],
    models: [],
    variants: [],
    colors: [],
    fuelTypes: [],
  });
  const [catalogLoading, setCatalogLoading] = useState<Record<string, boolean>>({});

  // Fetch flow details
  const { data: flowData, isLoading: flowLoading } = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => flowApi.getForUser(flowId!),
    enabled: !!flowId && !submissionId,
  });

  // Fetch existing submission
  const { data: submissionData, isLoading: submissionLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => formApi.getById(submissionId!),
    enabled: !!submissionId,
  });

  const startMutation = useMutation({
    mutationFn: (flowId: string) => formApi.start(flowId),
    onSuccess: (response) => {
      const newSubmission = response.data.data;
      setSubmission(newSubmission);
      navigate(`/dashboard/submissions/${newSubmission.id}`, { replace: true });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, tabIndex, data }: { id: string; tabIndex: number; data: Record<string, any> }) =>
      formApi.saveTab(id, tabIndex, data),
    onSuccess: (response) => {
      const savedSubmission = response.data.data;
      setSubmission(savedSubmission);
      // Update local formData with server response to ensure consistency
      if (savedSubmission.formData) {
        setFormData(savedSubmission.formData);
      }
      // Don't invalidate queries here to prevent useEffect from resetting currentTab
    },
    onError: (error: any) => {
      const validationErrors = error.response?.data?.data;
      if (Array.isArray(validationErrors)) {
        toast({ title: 'Validation Error', description: validationErrors.join(', '), variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => formApi.submit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      toast({ title: 'Form submitted successfully' });
      navigate('/dashboard/submissions');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
    },
  });

  // Fetch external enquiry details
  const handleFetchDetails = async () => {
    if (!fetchSearchValue) {
      toast({ title: `Please enter ${fetchSearchType === 'enquiry' ? 'Enquiry Number' : 'Mobile Number'}`, variant: 'destructive' });
      return;
    }

    setFetchLoading(true);
    setFetchResults([]);

    try {
      const response = await externalApi.fetchEnquiry({
        enquiryNumber: fetchSearchType === 'enquiry' ? fetchSearchValue : undefined,
        mobileNumber: fetchSearchType === 'mobile' ? fetchSearchValue : undefined,
        authToken: fetchAuthToken || undefined, // Optional - will auto-generate if not provided
      });

      const data = response.data;
      
      if (!data.success) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      if (data.multiple) {
        // Multiple results - show selection
        setFetchResults(data.enquiries);
        toast({ title: `Found ${data.count} enquiries`, description: 'Select one to pre-fill' });
      } else {
        // Single result - apply directly
        applyFetchedData(data.data, data.rawData);
        setIsFetchDialogOpen(false);
        toast({ title: 'Details fetched successfully' });
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to fetch details';
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setFetchLoading(false);
    }
  };

  const handleSelectEnquiry = async (enquiryId: string) => {
    setFetchLoading(true);
    try {
      const response = await externalApi.fetchEnquiryById({
        enquiryId,
        authToken: fetchAuthToken || undefined,
      });

      if (response.data.success) {
        applyFetchedData(response.data.data, response.data.rawData);
        setIsFetchDialogOpen(false);
        setFetchResults([]);
        toast({ title: 'Details fetched successfully' });
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to fetch details', variant: 'destructive' });
    } finally {
      setFetchLoading(false);
    }
  };

  // Perform booking job
  const handlePerformBooking = async () => {
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number available', description: 'Please fetch details first', variant: 'destructive' });
      return;
    }
    
    setBookingLoading(true);
    setBookingJobStatus(null);
    
    try {
      const response = await jobApi.runBooking(fetchedEnquiryNo);
      
      if (response.data.success) {
        const jobId = response.data.jobId;
        setBookingJobId(jobId);
        setBookingJobStatus('running');
        toast({ title: 'Booking job started', description: `Job ID: ${jobId}` });
        
        // Poll for job status
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await jobApi.getJobStatus(jobId);
            const status = statusResponse.data.status;
            setBookingJobStatus(status);
            
            if (status === 'completed') {
              clearInterval(pollInterval);
              setBookingLoading(false);
              toast({ title: 'Booking completed successfully', variant: 'default' });
            } else if (status === 'failed') {
              clearInterval(pollInterval);
              setBookingLoading(false);
              toast({ title: 'Booking job failed', description: 'Check Jobs menu for details', variant: 'destructive' });
            }
          } catch (error) {
            // Job runner might be down, stop polling
            clearInterval(pollInterval);
            setBookingLoading(false);
          }
        }, 2000);
        
        // Clear polling after 5 minutes max
        setTimeout(() => clearInterval(pollInterval), 300000);
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
        setBookingLoading(false);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to start booking job';
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
      setBookingLoading(false);
    }
  };

  // Run enquiry search job
  const handleRunEnquiry = async () => {
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number available', description: 'Please fetch details first', variant: 'destructive' });
      return;
    }
    
    setEnquiryLoading(true);
    setEnquiryJobStatus(null);
    
    try {
      const response = await jobApi.runEnquiry(fetchedEnquiryNo);
      
      if (response.data.success) {
        const jobId = response.data.jobId;
        setEnquiryJobId(jobId);
        setEnquiryJobStatus('running');
        toast({ title: 'Enquiry search job started', description: `Job ID: ${jobId}` });
        
        // Poll for job status
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await jobApi.getJobStatus(jobId);
            const status = statusResponse.data.status;
            setEnquiryJobStatus(status);
            
            if (status === 'completed') {
              clearInterval(pollInterval);
              setEnquiryLoading(false);
              toast({ title: 'Enquiry search completed successfully', variant: 'default' });
            } else if (status === 'failed') {
              clearInterval(pollInterval);
              setEnquiryLoading(false);
              toast({ title: 'Enquiry search job failed', description: 'Check Jobs menu for details', variant: 'destructive' });
            }
          } catch (error) {
            // Job runner might be down, stop polling
            clearInterval(pollInterval);
            setEnquiryLoading(false);
          }
        }, 2000);
        
        // Clear polling after 5 minutes max
        setTimeout(() => clearInterval(pollInterval), 300000);
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
        setEnquiryLoading(false);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to start enquiry job';
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
      setEnquiryLoading(false);
    }
  };

  const applyFetchedData = (data: Record<string, any>, rawData?: any) => {
    // Parse the fetched data and apply to form
    const newFormData = { ...formData };
    
    console.log('Applying fetched data:', data);
    console.log('Raw data:', rawData);
    
    // Store enquiry number for "View Enquiry" button
    const enquiryNo = data['customer_enquiry.enquiry_no'] || rawData?.ENQUIRY_NO || rawData?.ENQUIRY_ID;
    if (enquiryNo) {
      setFetchedEnquiryNo(String(enquiryNo));
    }
    
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue; // Skip metadata fields
      
      // Key format is "screenCode.fieldName"
      const parts = key.split('.');
      if (parts.length !== 2) continue;
      
      const [screenCode, fieldName] = parts;
      
      // Apply value even if it's an empty string (but not undefined/null)
      if (screenCode && fieldName && value !== undefined && value !== null) {
        if (!newFormData[screenCode]) {
          newFormData[screenCode] = {};
        }
        newFormData[screenCode][fieldName] = value;
        console.log(`Set ${screenCode}.${fieldName} = ${value}`);
      }
    }
    
    console.log('New form data:', newFormData);
    setFormData(newFormData);
  };

  // Initialize form data from submission
  useEffect(() => {
    if (submissionData?.data?.data) {
      const sub = submissionData.data.data;
      setSubmission(sub);
      setFormData(sub.formData || {});
      // Only set currentTab on initial load, not on subsequent saves
      if (isInitialLoad) {
        setCurrentTab(sub.currentTabIndex || 0);
        setIsInitialLoad(false);
      }
    }
  }, [submissionData, isInitialLoad]);

  // Start new submission
  useEffect(() => {
    if (flowId && !submissionId && flowData?.data?.data) {
      startMutation.mutate(flowId);
    }
  }, [flowId, submissionId, flowData]);

  // Load cascading vehicle catalog options
  const loadCascadingOptions = async (fieldName: string, vehicleData: Record<string, any>) => {
    setCatalogLoading(prev => ({ ...prev, [fieldName]: true }));
    try {
      const brand = vehicleData?.brand || '';
      const model = vehicleData?.model || '';
      const variant = vehicleData?.variant || '';
      const color = vehicleData?.color || '';

      if (fieldName === 'brand') {
        const response = await vehicleCatalogApi.getBrands();
        setVehicleCatalogOptions(prev => ({ ...prev, brands: response.data.data || [] }));
      } else if (fieldName === 'model' && brand) {
        const response = await vehicleCatalogApi.getModels(brand);
        setVehicleCatalogOptions(prev => ({ ...prev, models: response.data.data || [] }));
      } else if (fieldName === 'variant' && brand && model) {
        const response = await vehicleCatalogApi.getVariants(brand, model);
        setVehicleCatalogOptions(prev => ({ ...prev, variants: response.data.data || [] }));
      } else if (fieldName === 'color' && brand && model && variant) {
        const response = await vehicleCatalogApi.getColours(brand, model, variant);
        setVehicleCatalogOptions(prev => ({ ...prev, colors: response.data.data || [] }));
      } else if (fieldName === 'fuel_type' && brand && model && variant && color) {
        const response = await vehicleCatalogApi.getFuelTypes(brand, model, variant, color);
        setVehicleCatalogOptions(prev => ({ ...prev, fuelTypes: response.data.data || [] }));
      }
    } catch (error) {
      console.error(`Failed to load ${fieldName} options:`, error);
    } finally {
      setCatalogLoading(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const flow = submission?.flow || flowData?.data?.data;
  const flowScreens = flow?.flowScreens?.sort((a: FlowScreen, b: FlowScreen) => a.tabOrder - b.tabOrder) || [];
  const currentScreen = flowScreens[currentTab]?.screen;
  const currentScreenCode = currentScreen?.code || '';
  const currentFields = currentScreen?.fields || [];

  // Load vehicle catalog options when on vehicle_details screen
  useEffect(() => {
    const screenCode = flowScreens[currentTab]?.screen?.code;
    if (screenCode === 'vehicle_details') {
      const vehicleData = formData['vehicle_details'] || {};
      
      // Load brands on initial load
      loadCascadingOptions('brand', vehicleData);
      
      // Load dependent options if values already exist
      if (vehicleData.brand) {
        loadCascadingOptions('model', vehicleData);
      }
      if (vehicleData.brand && vehicleData.model) {
        loadCascadingOptions('variant', vehicleData);
      }
      if (vehicleData.brand && vehicleData.model && vehicleData.variant) {
        loadCascadingOptions('color', vehicleData);
      }
      if (vehicleData.brand && vehicleData.model && vehicleData.variant && vehicleData.color) {
        loadCascadingOptions('fuel_type', vehicleData);
      }
    }
  }, [currentTab, flowScreens.length]);

  const isViewer = user?.role === 'VIEWER';
  const isInsuranceExecutive = user?.role === 'INSURANCE_EXECUTIVE';
  const isInsuranceScreen = currentScreen?.code === 'insurance_nominee_demographics';
  
  // Insurance Executive can edit the insurance screen when pending insurance approval
  const canInsuranceExecutiveEdit = isInsuranceExecutive && isInsuranceScreen && 
    (submission?.status === 'PENDING_INSURANCE_APPROVAL' || submission?.status === 'PENDING_APPROVAL');
  
  const canEdit = !isViewer && (
    submission?.status === 'DRAFT' || 
    submission?.status === 'REJECTED' ||
    canInsuranceExecutiveEdit
  );
  const isLastTab = currentTab === flowScreens.length - 1;

  // Auto-populate Invoice and Gate Pass fields from previous screens
  const getAutoPopulatedValue = (fieldName: string): string => {
    const fd = formData;
    const customerData = fd['customer_enquiry'] || {};
    const addressData = fd['address_and_details'] || {};
    const vehicleData = fd['vehicle_details'] || {};
    const amountsData = fd['amounts_tax'] || {};
    const insuranceData = fd['insurance_nominee_demographics'] || {};
    
    // Field mapping for Invoice and Gate Pass
    const fieldMappings: Record<string, any> = {
      // Invoice/Gate Pass - Customer details
      'customer_name': `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim(),
      'customer_mobile': customerData.mobile_no || '',
      'customer_address': addressData.address || '',
      
      // Invoice/Gate Pass - Vehicle details
      'vehicle_brand': vehicleData.brand || '',
      'vehicle_model': vehicleData.model || '',
      'vehicle_variant': vehicleData.variant || '',
      'vehicle_color': vehicleData.color || '',
      'chassis_number': vehicleData.chassis_no || '',
      'engine_number': vehicleData.engine_no || '',
      'registration_number': vehicleData.registration_type || '',
      
      // Invoice - Amount details
      'base_amount': amountsData.base_amount || '',
      'other_charges': amountsData.other_amount || '',
      'discount_amount': amountsData.discount || '',
      'tax_amount': amountsData.life_tax_amount || '',
      'total_amount': amountsData.total_amount || '',
      'payment_mode': amountsData.payment_mode || '',
      
      // Invoice - Insurance details
      'insurance_provider': insuranceData.insurer_name || '',
      'insurance_premium': insuranceData.premium || '',
      
      // Auto-generated fields
      'invoice_number': submission?.id ? `INV-${submission.id.slice(-8).toUpperCase()}` : 'Auto-generated',
      'invoice_date': new Date().toISOString().split('T')[0],
      'gate_pass_number': submission?.id ? `GP-${submission.id.slice(-8).toUpperCase()}` : 'Auto-generated',
      'gate_pass_date': new Date().toISOString().split('T')[0],
      'gate_pass_time': new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
    
    return fieldMappings[fieldName] ?? '';
  };

  const getFieldValue = (fieldName: string) => {
    // Special handling for approval_status field - auto-compute based on screen config and submission status
    if (fieldName === 'approval_status') {
      const currentFlowScreen = flowScreens[currentTab];
      const screenRequiresApproval = currentFlowScreen?.screen?.requiresApproval;
      const screenRequiresInsuranceApproval = currentFlowScreen?.screen?.requiresInsuranceApproval;
      
      // Check if this screen requires any approval
      if (!screenRequiresApproval && !screenRequiresInsuranceApproval) {
        return 'na';
      }
      
      // Check submission status
      if (!submission) return 'na';
      
      // For insurance approval screen, show insurance approval status
      if (screenRequiresInsuranceApproval) {
        const insuranceStatus = submission.insuranceApprovalStatus;
        if (insuranceStatus === 'APPROVED') {
          // If there's also manager approval required, check that
          if (screenRequiresApproval) {
            switch (submission.status) {
              case 'PENDING_MANAGER_APPROVAL':
                return 'pending';
              case 'APPROVED':
                return 'approved';
              case 'REJECTED':
                return 'rejected';
              default:
                return 'pending';
            }
          }
          return 'approved';
        } else if (insuranceStatus === 'REJECTED') {
          return 'rejected';
        } else if (submission.status === 'PENDING_INSURANCE_APPROVAL') {
          return 'pending';
        }
      }
      
      switch (submission.status) {
        case 'PENDING_INSURANCE_APPROVAL':
          return 'pending';
        case 'PENDING_MANAGER_APPROVAL':
          return 'pending';
        case 'PENDING_APPROVAL':
          return 'pending';
        case 'APPROVED':
          return 'approved';
        case 'REJECTED':
          return 'rejected';
        case 'DRAFT':
        default:
          return 'pending'; // Will show pending once submitted
      }
    }
    
    // For post-approval screens (Invoice, Gate Pass), auto-populate from previous screens
    if (isPostApprovalScreen(currentScreenCode)) {
      // First check if there's already saved data for this field
      const savedValue = formData[currentScreenCode]?.[fieldName];
      if (savedValue !== undefined && savedValue !== '') {
        return savedValue;
      }
      // Otherwise, try to auto-populate
      const autoValue = getAutoPopulatedValue(fieldName);
      if (autoValue) {
        return autoValue;
      }
    }
    
    return formData[currentScreenCode]?.[fieldName] ?? '';
  };

  const setFieldValue = (fieldName: string, value: any) => {
    // Handle cascading resets for vehicle fields
    if (currentScreenCode === 'vehicle_details' && CASCADING_VEHICLE_FIELDS.includes(fieldName)) {
      const dependentFields: Record<string, string[]> = {
        brand: ['model', 'variant', 'color', 'fuel_type'],
        model: ['variant', 'color', 'fuel_type'],
        variant: ['color', 'fuel_type'],
        color: ['fuel_type'],
        fuel_type: [],
      };
      
      const fieldsToReset = dependentFields[fieldName] || [];
      
      setFormData((prev) => {
        const updatedScreenData = { ...prev[currentScreenCode], [fieldName]: value };
        // Reset dependent fields
        fieldsToReset.forEach(field => {
          updatedScreenData[field] = '';
        });
        return {
          ...prev,
          [currentScreenCode]: updatedScreenData,
        };
      });
      
      // Reset dependent options
      if (fieldName === 'brand') {
        setVehicleCatalogOptions(prev => ({ ...prev, models: [], variants: [], colors: [], fuelTypes: [] }));
        if (value) loadCascadingOptions('model', { brand: value });
      } else if (fieldName === 'model') {
        setVehicleCatalogOptions(prev => ({ ...prev, variants: [], colors: [], fuelTypes: [] }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) loadCascadingOptions('variant', { ...vehicleData, model: value });
      } else if (fieldName === 'variant') {
        setVehicleCatalogOptions(prev => ({ ...prev, colors: [], fuelTypes: [] }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) loadCascadingOptions('color', { ...vehicleData, variant: value });
      } else if (fieldName === 'color') {
        setVehicleCatalogOptions(prev => ({ ...prev, fuelTypes: [] }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) loadCascadingOptions('fuel_type', { ...vehicleData, color: value });
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [currentScreenCode]: {
          ...prev[currentScreenCode],
          [fieldName]: value,
        },
      }));
    }
    
    // Clear error when value changes
    if (errors[fieldName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validateCurrentTab = () => {
    const newErrors: Record<string, string> = {};
    
    for (const field of currentFields) {
      // Skip validation for fields that are not visible (conditional fields)
      if (!isFieldVisible(field)) continue;
      
      const value = getFieldValue(field.name);
      
      // Check required
      if (field.isRequired && (value === undefined || value === null || value === '')) {
        newErrors[field.name] = `${field.label} is required`;
        continue;
      }

      // Skip validation if empty and not required
      if (value === undefined || value === null || value === '') continue;

      // Check regex
      if (field.validationRegex) {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(String(value))) {
          newErrors[field.name] = field.validationMessage || `${field.label} is invalid`;
        }
      }
      
      // Check for past date validation (booking_date should not allow past dates)
      if (field.fieldType === 'DATE' && field.name === 'booking_date' && value) {
        const selectedDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          newErrors[field.name] = field.validationMessage || 'Date cannot be in the past';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!submission || !canEdit) return;
    
    if (!validateCurrentTab()) {
      toast({ title: 'Please fix validation errors', variant: 'destructive' });
      return;
    }

    try {
      await saveMutation.mutateAsync({
        id: submission.id,
        tabIndex: currentTab,
        data: formData[currentScreenCode] || {},
      });
      toast({ title: 'Saved successfully' });
    } catch {
      // Error handled by mutation
    }
  };

  const handleNext = async () => {
    if (!canEdit) {
      setCurrentTab((prev) => Math.min(prev + 1, flowScreens.length - 1));
      return;
    }

    if (!validateCurrentTab()) {
      toast({ title: 'Please fix validation errors', variant: 'destructive' });
      return;
    }

    try {
      // Save current tab first
      await saveMutation.mutateAsync({
        id: submission!.id,
        tabIndex: currentTab,
        data: formData[currentScreenCode] || {},
      });

      // Navigate to next tab
      setCurrentTab((prev) => Math.min(prev + 1, flowScreens.length - 1));
    } catch {
      // Error handled by mutation
    }
  };

  const handlePrev = () => {
    setCurrentTab((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!submission || !canEdit) return;

    if (!validateCurrentTab()) {
      toast({ title: 'Please fix validation errors', variant: 'destructive' });
      return;
    }

    // Save last tab first
    await saveMutation.mutateAsync({
      id: submission.id,
      tabIndex: currentTab,
      data: formData[currentScreenCode] || {},
    });

    submitMutation.mutate(submission.id);
  };

  // Check if a screen is a post-approval screen (Invoice, Gate Pass)
  const isPostApprovalScreen = (screenCode: string) => {
    return ['invoice', 'gate_pass'].includes(screenCode?.toLowerCase());
  };

  // Check if the submission is fully approved (for print functionality)
  const isFullyApproved = submission?.status === 'APPROVED';

  // User can only access tabs that have been saved (currentTabIndex tracks saved progress)
  // They can also view the current tab they're on
  // Post-approval screens (Invoice, Gate Pass) can be previewed anytime, but print only when APPROVED
  const canAccessTab = (tabIndex: number) => {
    if (!submission) return tabIndex === 0;
    
    // Check if this is a post-approval screen
    const targetScreen = flowScreens[tabIndex]?.screen;
    if (targetScreen && isPostApprovalScreen(targetScreen.code)) {
      // Allow preview access anytime (including DRAFT) - print still restricted to APPROVED
      return true;
    }
    
    // Can access any tab up to and including the saved tab index, 
    // plus the next one if navigating forward
    const savedTabIndex = submission.currentTabIndex || 0;
    // Allow access to already saved tabs and the current working tab
    return tabIndex <= savedTabIndex || tabIndex === currentTab;
  };

  // Check if a tab has been saved
  const isTabSaved = (tabIndex: number) => {
    if (!submission) return false;
    return tabIndex <= (submission.currentTabIndex || 0);
  };

  // Handle direct tab click - only allow if target tab is saved or previous
  const handleTabClick = (tabIndex: number) => {
    if (!canAccessTab(tabIndex)) {
      toast({ 
        title: 'Please complete and save current tab first', 
        variant: 'destructive' 
      });
      return;
    }
    
    // If trying to go forward to an unsaved tab, don't allow direct click
    if (tabIndex > currentTab && !isTabSaved(tabIndex - 1)) {
      toast({ 
        title: 'Please save the current tab before moving forward', 
        variant: 'destructive' 
      });
      return;
    }
    
    setCurrentTab(tabIndex);
  };

  const isFieldVisible = (field: ScreenField) => {
    // Check role-based visibility first
    const role = user?.role;
    let roleVisible = true;
    if (role === 'MANAGER') roleVisible = field.visibleToManager;
    else if (role === 'ASSOCIATE') roleVisible = field.visibleToAssociate;
    else if (role === 'VIEWER') roleVisible = field.visibleToViewer;
    else if (role === 'INSURANCE_EXECUTIVE') roleVisible = true; // Insurance Executive can view all fields
    
    if (!roleVisible) return false;
    
    // Check conditional visibility if configured
    if (field.conditionalField && field.conditionalValue) {
      let fieldValue: string | undefined;
      
      // Check if it's a cross-screen reference (contains a dot)
      if (field.conditionalField.includes('.')) {
        const [refScreenCode, fieldName] = field.conditionalField.split('.');
        // Look up the value from the formData - do case-insensitive lookup
        // formData keys are screen codes (e.g., 'customer_enquiry' or 'CUSTOMER_ENQUIRY')
        const formDataKey = Object.keys(formData).find(
          key => key.toLowerCase() === refScreenCode.toLowerCase()
        );
        if (formDataKey) {
          fieldValue = formData[formDataKey]?.[fieldName]?.toString()?.toLowerCase();
        }
      } else {
        // Same screen reference
        fieldValue = formData[currentScreenCode]?.[field.conditionalField]?.toString()?.toLowerCase();
      }
      
      // Check if the field value matches any of the conditional values (comma-separated)
      const allowedValues = field.conditionalValue.split(',').map(v => v.trim().toLowerCase());
      if (!fieldValue || !allowedValues.includes(fieldValue)) {
        return false;
      }
    }
    
    return true;
  };

  const isFieldEditable = (field: ScreenField) => {
    if (!canEdit) return false;
    const role = user?.role;
    if (role === 'MANAGER') return field.editableByManager;
    if (role === 'ASSOCIATE') return field.editableByAssociate;
    if (role === 'VIEWER') return field.editableByViewer;
    // Insurance Executive can edit insurance screen fields when pending insurance approval
    if (role === 'INSURANCE_EXECUTIVE' && canInsuranceExecutiveEdit) {
      return true; // Allow editing all fields on insurance screen
    }
    return false;
  };

  const renderField = (field: ScreenField) => {
    if (!isFieldVisible(field)) return null;

    const value = getFieldValue(field.name);
    const editable = isFieldEditable(field);
    const error = errors[field.name];

    const commonProps = {
      disabled: !editable,
      className: cn(error && 'border-destructive'),
    };

    let input;

    switch (field.fieldType) {
      case 'TEXTAREA':
        input = (
          <Textarea
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            {...commonProps}
          />
        );
        break;

      case 'SELECT':
        const options = parseOptions(field.options);
        
        // Special display for approval_status field - show as badge
        if (field.name === 'approval_status') {
          const statusColors: Record<string, string> = {
            'na': 'bg-gray-100 text-gray-800 border-gray-300',
            'pending': 'bg-yellow-100 text-yellow-800 border-yellow-300',
            'approved': 'bg-green-100 text-green-800 border-green-300',
            'rejected': 'bg-red-100 text-red-800 border-red-300',
          };
          const statusLabel = options.find(opt => opt.value === value)?.label || 'N/A';
          input = (
            <div className={cn(
              'inline-flex items-center px-4 py-2 rounded-md border font-medium text-sm',
              statusColors[value] || statusColors['na']
            )}>
              {statusLabel}
            </div>
          );
        } else if (currentScreenCode === 'vehicle_details' && CASCADING_VEHICLE_FIELDS.includes(field.name)) {
          // Use cascading vehicle catalog options
          let cascadingOptions: string[] = [];
          let isLoading = false;
          let isDisabled = !editable;
          const vehicleData = formData['vehicle_details'] || {};
          
          switch (field.name) {
            case 'brand':
              cascadingOptions = vehicleCatalogOptions.brands;
              isLoading = catalogLoading['brand'] || false;
              break;
            case 'model':
              cascadingOptions = vehicleCatalogOptions.models;
              isLoading = catalogLoading['model'] || false;
              isDisabled = isDisabled || !vehicleData.brand;
              break;
            case 'variant':
              cascadingOptions = vehicleCatalogOptions.variants;
              isLoading = catalogLoading['variant'] || false;
              isDisabled = isDisabled || !vehicleData.brand || !vehicleData.model;
              break;
            case 'color':
              cascadingOptions = vehicleCatalogOptions.colors;
              isLoading = catalogLoading['color'] || false;
              isDisabled = isDisabled || !vehicleData.brand || !vehicleData.model || !vehicleData.variant;
              break;
            case 'fuel_type':
              cascadingOptions = vehicleCatalogOptions.fuelTypes;
              isLoading = catalogLoading['fuel_type'] || false;
              isDisabled = isDisabled || !vehicleData.brand || !vehicleData.model || !vehicleData.variant || !vehicleData.color;
              break;
          }
          
          // If no catalog options available, fall back to static options
          const finalOptions = cascadingOptions.length > 0 
            ? cascadingOptions.map(opt => ({ value: opt, label: opt }))
            : options;
          
          input = (
            <div className="relative">
              <Select
                value={value}
                onValueChange={(v) => setFieldValue(field.name, v)}
                disabled={isDisabled || isLoading}
              >
                <SelectTrigger className={cn(error && 'border-destructive', isLoading && 'pr-10')}>
                  <SelectValue placeholder={
                    isLoading ? 'Loading...' : 
                    isDisabled && !editable ? 'Select...' :
                    isDisabled ? `Select ${VEHICLE_FIELD_DEPENDENCIES[field.name]?.slice(-1)[0] || ''} first` :
                    field.placeholder || 'Select...'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {finalOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLoading && (
                <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          );
        } else {
          input = (
            <Select
              value={value}
              onValueChange={(v) => setFieldValue(field.name, v)}
              disabled={!editable}
            >
              <SelectTrigger className={cn(error && 'border-destructive')}>
                <SelectValue placeholder={field.placeholder || 'Select...'} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        break;

      case 'CHECKBOX':
        input = (
          <Checkbox
            checked={value === true || value === 'true'}
            onCheckedChange={(checked) => setFieldValue(field.name, checked)}
            disabled={!editable}
          />
        );
        break;

      case 'DATE':
        // For booking_date or similar fields, set min to today to prevent past dates
        const today = new Date().toISOString().split('T')[0];
        input = (
          <Input
            type="date"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            min={field.name === 'booking_date' ? today : undefined}
            {...commonProps}
          />
        );
        break;

      case 'DATETIME':
        input = (
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            {...commonProps}
          />
        );
        break;

      case 'NUMBER':
        input = (
          <Input
            type="number"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            {...commonProps}
          />
        );
        break;

      case 'EMAIL':
        input = (
          <Input
            type="email"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            {...commonProps}
          />
        );
        break;

      case 'FILE':
      case 'IMAGE':
        input = (
          <FileUpload
            value={value}
            onChange={(url) => setFieldValue(field.name, url)}
            accept=".pdf,.jpg,.jpeg,.png"
            maxSize={4}
            disabled={!editable}
            error={error}
          />
        );
        break;

      default:
        input = (
          <Input
            type="text"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            placeholder={field.placeholder || ''}
            {...commonProps}
          />
        );
    }

    return (
      <div key={field.id} className="space-y-2">
        <Label className="flex items-center gap-1">
          {field.label}
          {field.isRequired && <span className="text-destructive">*</span>}
        </Label>
        {input}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  };

  if (flowLoading || submissionLoading || startMutation.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!flow) {
    return <div className="text-center py-12">Flow not found</div>;
  }

  return (
    <div className="page-enter space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{flow.name}</h1>
          <p className="text-muted-foreground">{flow.description}</p>
        </div>
        {submission && (
          <Badge className={cn(
            submission.status === 'DRAFT' && 'bg-gray-100 text-gray-800',
            submission.status === 'PENDING_APPROVAL' && 'bg-yellow-100 text-yellow-800',
            submission.status === 'APPROVED' && 'bg-green-100 text-green-800',
            submission.status === 'REJECTED' && 'bg-red-100 text-red-800'
          )}>
            {submission.status.replace('_', ' ')}
          </Badge>
        )}
      </div>

      {/* Tab Navigation - hidden when printing */}
      <div className="flex gap-2 overflow-x-auto pb-2 print:hidden">
        {flowScreens.map((fs: FlowScreen, index: number) => {
          const saved = isTabSaved(index);
          const isCurrent = index === currentTab;
          const isPostApproval = isPostApprovalScreen(fs.screen?.code || '');
          const accessible = canAccessTab(index);

          return (
            <button
              key={fs.id}
              onClick={() => handleTabClick(index)}
              disabled={!accessible}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap',
                isCurrent && 'bg-primary text-primary-foreground border-primary',
                !isCurrent && accessible && 'hover:bg-secondary',
                !accessible && 'opacity-50 cursor-not-allowed',
                isPostApproval && !isCurrent && !isFullyApproved && 'border-blue-400 bg-blue-50',
                isPostApproval && !isCurrent && isFullyApproved && 'border-green-400 bg-green-50'
              )}
              title={isPostApproval ? (
                isFullyApproved 
                  ? 'Ready to print' 
                  : 'Preview only - Print available after full approval'
              ) : undefined}
            >
              {saved && !isCurrent && !isPostApproval && (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {isPostApproval && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  !isFullyApproved && 'bg-blue-200 text-blue-800',
                  isFullyApproved && 'bg-green-200 text-green-800'
                )}>
                  {isFullyApproved ? '✓' : '👁️'}
                </span>
              )}
              <span className="text-sm font-medium">
                {index + 1}. {fs.tabName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Form Content */}
      <Card className="print:shadow-none print:border-0">
        <CardHeader className="print:pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="print:text-xl">
                {currentScreen?.name}
                {isPostApprovalScreen(currentScreenCode) && (
                  <span className={cn(
                    "text-sm font-normal ml-2 print:hidden",
                    isFullyApproved ? "text-green-600" : "text-blue-600"
                  )}>
                    {isFullyApproved ? '(Ready to Print)' : '(Preview - Awaiting Approval)'}
                  </span>
                )}
              </CardTitle>
            </div>
            {/* Fetch Details and View Enquiry Buttons - only show on customer_enquiry screen */}
            {currentScreenCode === 'customer_enquiry' && (
              <div className="flex gap-2">
                {canEdit && (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsFetchDialogOpen(true)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Fetch Details
                  </Button>
                )}
                {fetchedEnquiryNo && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => window.open(
                        `https://www.advantagetvs.in/LiteApp/sales/sales-process/enquiry-list/enquiry?enquiryId=${fetchedEnquiryNo}&type=VIEW`,
                        '_blank'
                      )}
                      className="gap-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Enquiry
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={handleRunEnquiry}
                      disabled={enquiryLoading}
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      {enquiryLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {enquiryJobStatus === 'running' ? 'Processing...' : 'Starting...'}
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Run Enquiry
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={handlePerformBooking}
                      disabled={bookingLoading}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                      {bookingLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {bookingJobStatus === 'running' ? 'Processing...' : 'Starting...'}
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Perform Booking
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Print header - only visible when printing */}
          {isPostApprovalScreen(currentScreenCode) && (
            <div className="hidden print:block text-sm text-muted-foreground mt-2">
              <p>Date: {new Date().toLocaleDateString('en-IN')}</p>
              <p>Submission ID: {submission?.id}</p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4 print:space-y-2">
          {currentFields
            .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
            .map((field: ScreenField) => renderField(field))}
        </CardContent>
      </Card>

      {/* Navigation - hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentTab === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>

        <div className="flex gap-2">
          {/* Print button for Invoice and Gate Pass screens - only when fully approved */}
          {isPostApprovalScreen(currentScreenCode) && (
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="print:hidden"
              disabled={!isFullyApproved}
              title={!isFullyApproved ? 'Print available after full approval' : 'Print this document'}
            >
              <Printer className="h-4 w-4 mr-1" />
              {isFullyApproved ? 'Print' : 'Print (Pending Approval)'}
            </Button>
          )}

          {canEdit && (
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          )}

          {isLastTab ? (
            canEdit && (
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Submit
              </Button>
            )
          ) : (
            <Button onClick={handleNext} disabled={saveMutation.isPending}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Fetch Details Dialog */}
      <Dialog open={isFetchDialogOpen} onOpenChange={setIsFetchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fetch Details from TVS/Honda</DialogTitle>
            <DialogDescription>
              Search by Enquiry Number or Mobile Number to auto-fill form details.
              Token will be auto-generated if credentials are configured.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search Type</Label>
              <Select
                value={fetchSearchType}
                onValueChange={(v: 'enquiry' | 'mobile') => {
                  setFetchSearchType(v);
                  setFetchSearchValue('');
                  setFetchResults([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile">Mobile Number</SelectItem>
                  <SelectItem value="enquiry">Enquiry Number</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{fetchSearchType === 'enquiry' ? 'Enquiry Number' : 'Mobile Number'}</Label>
              <Input
                type={fetchSearchType === 'mobile' ? 'tel' : 'text'}
                value={fetchSearchValue}
                onChange={(e) => setFetchSearchValue(e.target.value)}
                placeholder={fetchSearchType === 'enquiry' ? 'e.g., 23372' : 'e.g., 8885649152'}
              />
            </div>

            <div className="space-y-2">
              <Label>Authorization Token (Optional)</Label>
              <Textarea
                value={fetchAuthToken}
                onChange={(e) => setFetchAuthToken(e.target.value)}
                placeholder="Leave empty to auto-generate token (requires External Login ID and Role ID to be configured in user settings)"
                rows={2}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Token will be auto-generated if External Login ID and Role ID are set. Or paste manually from browser.
              </p>
            </div>

            {/* Results list when multiple found */}
            {fetchResults.length > 0 && (
              <div className="space-y-2">
                <Label>Select an Enquiry</Label>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {fetchResults.map((enquiry) => (
                    <button
                      key={enquiry.enquiryId}
                      onClick={() => handleSelectEnquiry(String(enquiry.enquiryNo))}
                      className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors"
                      disabled={fetchLoading}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{enquiry.customerName}</p>
                          <p className="text-sm text-muted-foreground">{enquiry.mobile}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">#{enquiry.enquiryNo}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{enquiry.model}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {enquiry.status} • {new Date(enquiry.date).toLocaleDateString('en-IN')}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsFetchDialogOpen(false);
              setFetchResults([]);
            }}>
              Cancel
            </Button>
            <Button onClick={handleFetchDetails} disabled={fetchLoading || !fetchSearchValue}>
              {fetchLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

