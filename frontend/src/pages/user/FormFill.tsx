import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Save, Send, Check, Loader2, Printer, Download, Search, ExternalLink, Play, RefreshCw, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
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

// Fields that appear after "Perform Booking" action — locked behind overlay until booking is done
const POST_BOOKING_FIELDS = ['registration_type', 'chassis_no', 'engine_no', 'key_no', 'battery_no', 'booking_no', 'customer_id', 'rto_state'];

// Define which fields are cascading vehicle fields (Brand → Model → Variant)
const CASCADING_VEHICLE_FIELDS = ['brand', 'model', 'variant'];
const VEHICLE_FIELD_DEPENDENCIES: Record<string, string[]> = {
  brand: [],
  model: ['brand'],
  variant: ['brand', 'model'],
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
  const [, setBookingJobStatus] = useState<string | null>(null);
  const [, setBookingLoading] = useState(false);
  const [, setIsBookedEnquiry] = useState(false);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  
  // Dynamic options added from API response (e.g. ENQUIRY_DESCRIPTION)
  const [dynamicEnquiryOptions, setDynamicEnquiryOptions] = useState<{ value: string; label: string }[]>([]);
  
  
  // Populate enquiry details state
  const [populateLoading, setPopulateLoading] = useState(false);
  const [populateDone, setPopulateDone] = useState(false);
  
  // Pre-booking (SelectedEnquiryByID) state
  const [preBookingLoading, setPreBookingLoading] = useState(false);
  const [preBookingDone, setPreBookingDone] = useState(false);
  
  // CGST/SGST metadata for cross-check validation
  const [cgstMeta, setCgstMeta] = useState<{ perc: number; applied: number; value: number } | null>(null);
  const [sgstMeta, setSgstMeta] = useState<{ perc: number; applied: number; value: number } | null>(null);
  
  // Model ID visibility toggle
  const [showModelId, setShowModelId] = useState(false);
  
  // Model parts fetch state
  const [modelPartsLoading, setModelPartsLoading] = useState(false);

  // Booking section unlock state (for post-booking fields on vehicle_details screen)
  const [bookingSectionUnlocked, setBookingSectionUnlocked] = useState(false);
  const [bookingAmount, setBookingAmount] = useState('');
  const [performBookingLoading, setPerformBookingLoading] = useState(false);
  const [, setSaveBookingResponse] = useState<any>(null);

  // Cascading vehicle dropdown state
  const [vehicleCatalogOptions, setVehicleCatalogOptions] = useState<{
    brands: string[];
    models: string[];
    variants: string[];
  }>({
    brands: [],
    models: [],
    variants: [],
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
    refetchOnWindowFocus: false,
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
    mutationFn: ({ id, tabIndex, data }: { id: string; tabIndex: number; data: Record<string, any>; screenCode: string }) =>
      formApi.saveTab(id, tabIndex, data),
    onSuccess: (response, variables) => {
      const savedSubmission = response.data.data;
      setSubmission(savedSubmission);
      // Only update the screen that was actually saved from server response,
      // preserving local pre-fill data on other screens (e.g. from pre-booking fetch)
      if (savedSubmission.formData) {
        const serverData = savedSubmission.formData as Record<string, any>;
        setFormData((prev: Record<string, Record<string, any>>) => ({
          ...prev,
          [variables.screenCode]: serverData[variables.screenCode] ?? prev[variables.screenCode],
        }));
      }
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

  // Perform booking job (called after confirmation)
  const handlePerformBooking = async () => {
    setShowBookingConfirm(false);
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

  // Fetch full enquiry details via PopulateEnquiryDetailsById and cache to file
  const handlePopulateEnquiry = async () => {
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number available', description: 'Please fetch details on Customer & Enquiry screen first', variant: 'destructive' });
      return;
    }
    
    setPopulateLoading(true);
    try {
      const response = await externalApi.populateEnquiry({ enquiryId: fetchedEnquiryNo });
      
      if (response.data.success) {
        setPopulateDone(true);
        toast({ title: 'Enquiry details fetched & cached', description: `Data saved as ${response.data.cachedAs}` });
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to fetch enquiry details', variant: 'destructive' });
    } finally {
      setPopulateLoading(false);
    }
  };

  // Fetch pre-booking data via SelectedEnquiryByID, cache to file, and apply mapped fields
  const handleFetchPreBooking = async () => {
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number available', description: 'Please fetch details on Customer & Enquiry screen first', variant: 'destructive' });
      return;
    }
    
    setPreBookingLoading(true);
    try {
      const response = await externalApi.fetchPreBooking({ enquiryId: fetchedEnquiryNo });
      
      if (response.data.success) {
        const mapped = response.data.mappedFields || {};
        console.log('Pre-booking response data keys:', Object.keys(response.data.data || {}));
        console.log('Pre-booking mappedFields:', JSON.stringify(mapped, null, 2));
        
        // Check if mappedFields is empty — means booking was already performed
        const dataFields = Object.keys(mapped).filter(k => !k.startsWith('_'));
        if (dataFields.length === 0) {
          toast({ title: 'Booking already performed', description: 'No pre-booking data available. This enquiry has already been booked.', variant: 'destructive' });
          setPreBookingDone(true);
          return;
        }
        
        const newFormData = { ...formData };
        
        // Apply mapped fields to form data (e.g. vehicle_details.customer_id, amounts_tax.base_amount)
        for (const [key, value] of Object.entries(mapped)) {
          if (key.startsWith('_')) continue;
          const parts = key.split('.');
          if (parts.length !== 2) continue;
          const [screenCode, fieldName] = parts;
          if (screenCode && fieldName && value !== undefined && value !== null) {
            if (!newFormData[screenCode]) newFormData[screenCode] = {};
            newFormData[screenCode][fieldName] = value;
          }
        }
        
        console.log('Pre-booking updated formData:', JSON.stringify(newFormData, null, 2));
        setFormData(newFormData);
        
        // Auto-fetch model parts if MODEL_ID is available to populate VehicleCatalog
        const extractedModelId = newFormData['vehicle_details']?.model_id;
        if (extractedModelId) {
          handleFetchModelParts(extractedModelId);
        }
        
        // Store CGST/SGST metadata for cross-check validation
        if (mapped['_cgst_perc'] !== undefined) {
          setCgstMeta({ perc: mapped['_cgst_perc'], applied: mapped['_cgst_applied'], value: mapped['_cgst_value'] });
        }
        if (mapped['_sgst_perc'] !== undefined) {
          setSgstMeta({ perc: mapped['_sgst_perc'], applied: mapped['_sgst_applied'], value: mapped['_sgst_value'] });
        }
        
        setPreBookingDone(true);
        toast({ title: 'Pre-booking data fetched & applied', description: 'Fields have been populated. Please verify.' });
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to fetch pre-booking data', variant: 'destructive' });
    } finally {
      setPreBookingLoading(false);
    }
  };

  // Fetch model parts from TVS API to populate VehicleCatalog (Brand → Model → Variant)
  const handleFetchModelParts = async (modelIdOverride?: string) => {
    const modelIdToUse = modelIdOverride || formData['vehicle_details']?.model_id;
    if (!modelIdToUse) {
      toast({ title: 'No Model ID', description: 'Model ID not available. Fetch pre-booking data first.', variant: 'destructive' });
      return;
    }
    setModelPartsLoading(true);
    try {
      const response = await externalApi.fetchModelParts({ modelId: modelIdToUse, countryCode: 'IN' });
      if (response.data.success) {
        const { inserted, skipped, brands, models } = response.data.data;
        toast({
          title: 'Model parts loaded',
          description: `${inserted} new variants added, ${skipped} already existed. Brands: ${brands?.join(', ')}, Models: ${models?.join(', ')}`,
        });
        // Reload the cascading options for brand
        loadCascadingOptions('brand', formData['vehicle_details'] || {});
        // If brand is "TVS" (default), auto-set it and load models
        const vehicleData = formData['vehicle_details'] || {};
        if (!vehicleData.brand && brands?.includes('TVS')) {
          setFormData(prev => ({
            ...prev,
            vehicle_details: { ...prev['vehicle_details'], brand: 'TVS' },
          }));
          setTimeout(() => loadCascadingOptions('model', { brand: 'TVS' }), 300);
        } else if (vehicleData.brand) {
          loadCascadingOptions('model', vehicleData);
          if (vehicleData.model) {
            loadCascadingOptions('variant', vehicleData);
          }
        }
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to fetch model parts', variant: 'destructive' });
    } finally {
      setModelPartsLoading(false);
    }
  };

  const applyFetchedData = (data: Record<string, any>, rawData?: any) => {
    const newFormData = { ...formData };
    
    console.log('Applying fetched data:', data);
    console.log('Raw data:', rawData);
    
    // Store enquiry number for "View Enquiry" button
    const enquiryNo = data['customer_enquiry.enquiry_no'] || rawData?.ENQUIRY_NO || rawData?.ENQUIRY_ID;
    if (enquiryNo) {
      setFetchedEnquiryNo(String(enquiryNo));
    }
    
    // Track if this enquiry is already booked (check both Booked flag and STATUS_DESC)
    const bookedFlag = data['_booked'] ?? rawData?.Booked ?? 0;
    const statusDesc = (data['_status'] || rawData?.STATUS_DESC || '').toLowerCase();
    setIsBookedEnquiry(bookedFlag === 1 || statusDesc === 'booked');
    
    // Handle ENQUIRY_DESCRIPTION -> map to enquiry dropdown, add dynamically if not existing
    const enquiryDesc = data['customer_enquiry.enquiry'] || data['_enquiry_description'] || rawData?.ENQUIRY_DESCRIPTION || '';
    if (enquiryDesc) {
      const normalizedValue = enquiryDesc.toLowerCase().replace(/\s+/g, '_');
      
      // Check if this value already exists in static options from the field definition
      const allScreens = submission?.flow?.flowScreens || [];
      const custEnqScreen = allScreens.find((fs: any) => fs.screen?.code === 'customer_enquiry');
      const enquiryField = custEnqScreen?.screen?.fields?.find((f: any) => f.name === 'enquiry');
      const staticOptions = enquiryField?.options ? parseOptions(enquiryField.options) : [];
      const existsInStatic = staticOptions.some((o: any) => o.value === normalizedValue || o.label.toLowerCase() === enquiryDesc.toLowerCase());
      
      if (!existsInStatic) {
        setDynamicEnquiryOptions(prev => {
          const existsInDynamic = prev.some(o => o.value === normalizedValue);
          if (!existsInDynamic) {
            return [...prev, { value: normalizedValue, label: enquiryDesc }];
          }
          return prev;
        });
      }
      
      // Use the matching static option value if found, otherwise use normalized
      const matchingStatic = staticOptions.find((o: any) => o.value === normalizedValue || o.label.toLowerCase() === enquiryDesc.toLowerCase());
      if (!newFormData['customer_enquiry']) {
        newFormData['customer_enquiry'] = {};
      }
      newFormData['customer_enquiry']['enquiry'] = matchingStatic ? matchingStatic.value : normalizedValue;
    }
    
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue;
      if (key === 'customer_enquiry.enquiry' && enquiryDesc) continue; // Already handled above
      
      const parts = key.split('.');
      if (parts.length !== 2) continue;
      
      const [screenCode, fieldName] = parts;
      
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

  // Initialize form data from submission — only on initial load to avoid
  // wiping locally-set pre-booking/pre-fill data on React Query background refetches
  useEffect(() => {
    if (submissionData?.data?.data && isInitialLoad) {
      const sub = submissionData.data.data;
      setSubmission(sub);
      setFormData(sub.formData || {});
      // Restore fetchedEnquiryNo from saved form data
      const savedEnquiryNo = sub.formData?.customer_enquiry?.enquiry_no;
      if (savedEnquiryNo && !fetchedEnquiryNo) {
        setFetchedEnquiryNo(String(savedEnquiryNo));
      }
      setCurrentTab(sub.currentTabIndex || 0);
      setIsInitialLoad(false);
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

      if (fieldName === 'brand') {
        const response = await vehicleCatalogApi.getBrands();
        setVehicleCatalogOptions(prev => ({ ...prev, brands: response.data.data || [] }));
      } else if (fieldName === 'model' && brand) {
        const response = await vehicleCatalogApi.getModels(brand);
        setVehicleCatalogOptions(prev => ({ ...prev, models: response.data.data || [] }));
      } else if (fieldName === 'variant' && brand && model) {
        const response = await vehicleCatalogApi.getVariants(brand, model);
        setVehicleCatalogOptions(prev => ({ ...prev, variants: response.data.data || [] }));
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
    }
  }, [currentTab, flowScreens.length]);

  // Auto-unlock post-booking section if data already exists (returning to saved form)
  useEffect(() => {
    const screenCode = flowScreens[currentTab]?.screen?.code;
    if (screenCode === 'vehicle_details') {
      const vehicleData = formData['vehicle_details'] || {};
      if (vehicleData.booking_amount || vehicleData.booking_no || vehicleData.chassis_no) {
        setBookingSectionUnlocked(true);
        if (vehicleData.booking_amount) setBookingAmount(vehicleData.booking_amount);
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
        brand: ['model', 'variant'],
        model: ['variant'],
        variant: [],
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
        setVehicleCatalogOptions(prev => ({ ...prev, models: [], variants: [] }));
        if (value) loadCascadingOptions('model', { brand: value });
      } else if (fieldName === 'model') {
        setVehicleCatalogOptions(prev => ({ ...prev, variants: [] }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) loadCascadingOptions('variant', { ...vehicleData, model: value });
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

    // Cross-field validation: either rep_name or executive_name required
    if (currentScreenCode === 'customer_enquiry') {
      const repName = getFieldValue('rep_name')?.toString().trim();
      const execName = getFieldValue('executive_name')?.toString().trim();
      if (!repName && !execName) {
        newErrors['rep_name'] = 'Either Sales Rep Name or Executive Name is required';
        newErrors['executive_name'] = 'Either Sales Rep Name or Executive Name is required';
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
        screenCode: currentScreenCode,
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
        screenCode: currentScreenCode,
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
      screenCode: currentScreenCode,
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

    // Custom: model_id — hidden by default, revealed via eye icon
    if (field.name === 'model_id' && currentScreenCode === 'vehicle_details') {
      const modelIdValue = getFieldValue('model_id') || '';
      if (!modelIdValue) return null;
      return (
        <div key={field.name} className="space-y-2 print:space-y-1 col-span-full">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Model ID</Label>
            <button
              type="button"
              onClick={() => setShowModelId(!showModelId)}
              className="p-1 rounded hover:bg-secondary transition-colors"
              title={showModelId ? 'Hide Model ID' : 'Show Model ID'}
            >
              {showModelId ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {showModelId && (
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{modelIdValue}</span>
            )}
          </div>
        </div>
      );
    }

    // Custom: CGST/SGST line — formatted display with cross-check validation
    if ((field.name === 'cgst_line' || field.name === 'sgst_line') && currentScreenCode === 'amounts_tax') {
      const lineValue = getFieldValue(field.name) || '';
      if (!lineValue) return null;
      
      const meta = field.name === 'cgst_line' ? cgstMeta : sgstMeta;
      const label = field.name === 'cgst_line' ? 'CGST' : 'SGST';
      
      let calculated: number | null = null;
      let isMatch = true;
      if (meta) {
        calculated = parseFloat(((meta.perc / 100) * meta.applied).toFixed(2));
        isMatch = Math.abs(calculated - meta.value) < 0.01;
      }

      return (
        <div key={field.name} className="space-y-2 print:space-y-1 col-span-full">
          <Label className="text-sm font-medium">{label}</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono">
              {lineValue}
            </div>
            {meta && (
              <div className={cn(
                "px-3 py-2 rounded-md text-sm font-mono border min-w-[120px] text-center",
                isMatch
                  ? "bg-green-50 border-green-300 text-green-800"
                  : "bg-red-50 border-red-400 text-red-800 font-bold"
              )}
              title={isMatch ? 'Calculation matches' : `Expected ${meta.value}, calculated ${calculated}`}
              >
                {calculated}
                {isMatch ? ' ✓' : ' ✗'}
              </div>
            )}
          </div>
          {meta && !isMatch && (
            <p className="text-xs text-red-600">
              Mismatch: {meta.perc}% of {meta.applied} = {calculated}, but API returned {meta.value}
            </p>
          )}
        </div>
      );
    }

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
          // Merge dynamic enquiry options for the 'enquiry' field
          const mergedOptions = field.name === 'enquiry' && currentScreenCode === 'customer_enquiry'
            ? [...options, ...dynamicEnquiryOptions.filter(dOpt => !options.some(o => o.value === dOpt.value))]
            : options;
          
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
                {mergedOptions.map((opt) => (
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
                  </>
                )}
              </div>
            )}
            {/* Fetch buttons - on address_and_details screen */}
            {currentScreenCode === 'address_and_details' && fetchedEnquiryNo && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePopulateEnquiry}
                  disabled={populateLoading}
                  className={cn(
                    "gap-2",
                    populateDone
                      ? "border-green-300 text-green-700 hover:bg-green-50"
                      : "border-blue-300 text-blue-700 hover:bg-blue-50"
                  )}
                >
                  {populateLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Fetching...
                    </>
                  ) : populateDone ? (
                    <>
                      <Check className="h-4 w-4" />
                      Fetched & Cached
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Fetch Using Enquiry Id
                    </>
                  )}
                </Button>
              </div>
            )}
            {/* Fetch Pre Booking, Pre Fetch & Perform Booking - on vehicle_details screen */}
            {currentScreenCode === 'vehicle_details' && fetchedEnquiryNo && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleFetchPreBooking}
                  disabled={preBookingLoading || modelPartsLoading}
                  className={cn(
                    "gap-2",
                    preBookingDone
                      ? "border-green-300 text-green-700 hover:bg-green-50"
                      : "border-purple-300 text-purple-700 hover:bg-purple-50"
                  )}
                >
                  {preBookingLoading || modelPartsLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {modelPartsLoading ? 'Loading Model Parts...' : 'Fetching Pre-Booking...'}
                    </>
                  ) : preBookingDone ? (
                    <>
                      <Check className="h-4 w-4" />
                      Form Pre-Filled
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Pre Fill Form
                    </>
                  )}
                </Button>
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
          {currentScreenCode === 'vehicle_details' ? (
            <>
              {/* Pre-booking fields (brand, model, variant, fuel_type, etc.) */}
              {currentFields
                .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
                .filter((field: ScreenField) => !POST_BOOKING_FIELDS.includes(field.name))
                .map((field: ScreenField) => renderField(field))}

              {/* Booking divider with Perform Booking button */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-dashed border-gray-300" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-sm font-medium text-gray-500">
                    Post-Booking Details
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50/50">
                <div className="flex-1 max-w-xs">
                  <Label className="text-sm font-medium mb-1.5 block">Booking Amount</Label>
                  <Input
                    type="number"
                    placeholder="Enter booking amount"
                    value={bookingAmount}
                    onChange={(e: any) => setBookingAmount(e.target.value)}
                    disabled={bookingSectionUnlocked || performBookingLoading}
                  />
                </div>
                <Button
                  onClick={async () => {
                    if (!bookingAmount) {
                      toast({ title: 'Booking amount required', description: 'Please enter the booking amount to proceed.', variant: 'destructive' });
                      return;
                    }
                    setPerformBookingLoading(true);
                    try {
                      // Read cached pre-booking JSON to construct SaveBooking body
                      const preBookingCache = formData['vehicle_details']?.model_id
                        ? await externalApi.getCachedEnquiry(`pre-booking-${fetchedEnquiryNo}`).catch(() => null)
                        : null;

                      // For now, pass the pre-booking cached response as bookingData
                      // The actual SaveBooking request body format may need adjustment
                      const cachedData = preBookingCache?.data?.data?.response || {};
                      const bookingData = {
                        ...cachedData,
                        BOOKING_AMT: Number(bookingAmount),
                      };

                      // Step 1: Call SaveBooking
                      const saveResponse = await externalApi.saveBooking({ bookingData });

                      if (saveResponse.data.success) {
                        const sbData = saveResponse.data.data;
                        setSaveBookingResponse(sbData);

                        // Step 2: Submit Voucher using SaveBooking response
                        try {
                          const voucherResponse = await externalApi.submitVoucher({
                            saveBookingResponse: sbData,
                            bookingAmount: Number(bookingAmount),
                          });

                          if (voucherResponse.data.success) {
                            toast({ title: 'Booking & Voucher submitted', description: 'Booking saved and voucher created successfully.' });
                          } else {
                            toast({ title: 'Voucher failed', description: voucherResponse.data.error || 'Booking saved but voucher submission failed.', variant: 'destructive' });
                          }
                        } catch (vErr: any) {
                          console.error('Voucher submission error:', vErr);
                          toast({ title: 'Voucher failed', description: 'Booking saved but voucher submission failed. You can retry later.', variant: 'destructive' });
                        }

                        // Unlock post-booking fields
                        setBookingSectionUnlocked(true);
                        setFormData((prev: Record<string, any>) => ({
                          ...prev,
                          vehicle_details: {
                            ...prev['vehicle_details'],
                            booking_amount: bookingAmount,
                            booking_no: sbData.BOOKING_NO || sbData.BookPartDetailsList?.[0]?.BOOK_PART_ID || '',
                          },
                        }));
                      } else {
                        toast({ title: 'Booking failed', description: saveResponse.data.error || 'Failed to save booking.', variant: 'destructive' });
                      }
                    } catch (error: any) {
                      console.error('Perform booking error:', error);
                      toast({ title: 'Booking failed', description: error.response?.data?.error || 'Failed to perform booking.', variant: 'destructive' });
                    } finally {
                      setPerformBookingLoading(false);
                    }
                  }}
                  disabled={bookingSectionUnlocked || performBookingLoading}
                  className={cn(
                    "gap-2",
                    bookingSectionUnlocked
                      ? "bg-green-600 hover:bg-green-600 cursor-default"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  {performBookingLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : bookingSectionUnlocked ? (
                    <>
                      <Unlock className="h-4 w-4" />
                      Booking Done
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Perform Booking
                    </>
                  )}
                </Button>
              </div>

              {/* Post-booking fields — with overlay if not unlocked */}
              <div className="relative">
                {!bookingSectionUnlocked && (
                  <div className="absolute inset-0 z-10 bg-gray-100/70 backdrop-blur-[1px] rounded-lg flex items-center justify-center cursor-not-allowed">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border text-sm text-gray-500">
                      <Lock className="h-4 w-4" />
                      Enter booking amount and click &quot;Perform Booking&quot; to unlock
                    </div>
                  </div>
                )}
                <div className={cn("space-y-4", !bookingSectionUnlocked && "pointer-events-none select-none")}>
                  {currentFields
                    .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
                    .filter((field: ScreenField) => POST_BOOKING_FIELDS.includes(field.name))
                    .map((field: ScreenField) => renderField(field))}
                </div>
              </div>
            </>
          ) : (
            currentFields
              .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
              .map((field: ScreenField) => renderField(field))
          )}
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

      {/* Booking Confirmation Dialog */}
      <Dialog open={showBookingConfirm} onOpenChange={setShowBookingConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              Are you sure the customer wants to book enquiry #{fetchedEnquiryNo}
              {formData['customer_enquiry']?.vehicle_model
                ? ` for model "${formData['customer_enquiry'].vehicle_model}"`
                : ''}
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handlePerformBooking}
            >
              <Play className="h-4 w-4 mr-1" />
              Yes, Perform Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

