import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Save, Send, Check, Loader2, Printer, Download, Search, ExternalLink, Play, RefreshCw, Eye, EyeOff, Lock, Unlock, AlertCircle, Key } from 'lucide-react';
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
import { flowApi, formApi, externalApi, vehicleCatalogApi, jobApi, otpConfigApi } from '@/lib/api';
import { parseOptions, cn } from '@/lib/utils';
import type { FormSubmission, ScreenField, FlowScreen } from '@/types';

// Fields that appear after "Perform Booking" action — locked behind overlay until booking is done
const POST_BOOKING_FIELDS = ['registration_type', 'key_no', 'battery_no', 'booking_no', 'customer_id', 'rto_state'];

// Chassis / engine — shown in pre-booking section (after pricing), loaded when Variant is selected
const FRAME_SELECTION_FIELDS = ['chassis_no', 'engine_no'];

// Rendered together in the vehicle pricing panel on Screen 3 (not as separate dynamic fields)
const VEHICLE_PRICING_PANEL_FIELDS = [
  'stock_available',
  'ex_showroom_price',
  'cgst_amount',
  'sgst_amount',
  'vehicle_total_price',
  'gst_amount', // legacy — hidden if present in old screen config
  'life_time_tax',
];

function calcVehicleTotalFromParts(vd: Record<string, any>): number {
  const ex = parseFloat(String(vd.ex_showroom_price)) || 0;
  const cgst = parseFloat(String(vd.cgst_amount)) || 0;
  const sgst = parseFloat(String(vd.sgst_amount)) || 0;
  return parseFloat((ex + cgst + sgst).toFixed(2));
}

function getExShowroomInclGstFromVehicle(vd: Record<string, any>): number {
  const stored = vd.vehicle_total_price;
  if (stored !== '' && stored != null && !Number.isNaN(parseFloat(String(stored)))) {
    return parseFloat(String(stored));
  }
  return calcVehicleTotalFromParts(vd);
}

function calcAmountsScreenTotal(at: Record<string, any>, lifeTaxFromScreen3?: number): number {
  const exInclGst = parseFloat(String(at.base_amount)) || 0;
  const lifeTax =
    lifeTaxFromScreen3 ?? (parseFloat(String(at.life_tax_amount)) || 0);
  const other = parseFloat(String(at.other_amount)) || 0;
  const discount = parseFloat(String(at.discount)) || 0;
  const accessories =
    parseFloat(String(at.accessories_amount ?? at.ew_discount)) || 0;
  const otherTax = parseFloat(String(at.other_tax)) || 0;
  return parseFloat(
    (exInclGst + lifeTax + other - discount + accessories + otherTax).toFixed(2)
  );
}

function buildSyncedAmountsTax(
  vd: Record<string, any>,
  at: Record<string, any> = {}
): Record<string, any> {
  const base = getExShowroomInclGstFromVehicle(vd);
  const lifeTax = parseFloat(String(vd.life_time_tax)) || 0;
  const merged = {
    ...at,
    base_amount: base,
    life_tax_amount: lifeTax,
  };
  return {
    ...merged,
    total_amount: calcAmountsScreenTotal(merged, lifeTax),
  };
}

const AMOUNTS_TOTAL_INPUT_FIELDS = [
  'other_amount',
  'discount',
  'accessories_amount',
  'other_tax',
  'ew_discount',
];

const AMOUNTS_TAX_HIDDEN_FIELDS = [
  'ex_showroom_price',
  'tax_amount',
  'booked_qty',
  'pending_qty',
];

// Define which fields are cascading vehicle fields (Brand → Model → SubModel → Variant)
const CASCADING_VEHICLE_FIELDS = ['brand', 'model', 'submodel', 'variant'];
const VEHICLE_FIELD_DEPENDENCIES: Record<string, string[]> = {
  brand: [],
  model: ['brand'],
  submodel: ['brand', 'model'],
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

  // TVS OTP — shared with Dashboard via react-query cache key 'tvs-otp'
  const [otpValue, setOtpValue] = useState('');
  const [isUpdatingOtp, setIsUpdatingOtp] = useState(false);
  
  // Booking confirmation modal state
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [bookingConfirmData, setBookingConfirmData] = useState<{
    lineItemData: any;
    brand: string;
    model: string;
    variant: string;
    quantity: number;
    unitPrice: number;
    exShowroomPrice: number;
    accCharges: number;
    discount: number;
    manualDiscount: number;
    regCharges: number;
    insCharges: number;
    bookingAmt: number;
  } | null>(null);
  
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

  // Booking section unlock state (for post-booking fields on vehicle_details screen)
  const [bookingSectionUnlocked, setBookingSectionUnlocked] = useState(false);
  const [bookingAmount, setBookingAmount] = useState('');
  const [performBookingLoading, setPerformBookingLoading] = useState(false);
  const [, setSaveBookingResponse] = useState<any>(null);

  // Already-booked lock: blocks navigation to other tabs
  const [isEnquiryBooked, setIsEnquiryBooked] = useState(false);

  // Chassis frame dropdown (loaded from TVS after booking)
  const [chassisOptions, setChassisOptions] = useState<{ value: string; label: string; engineNo: string; keyNo: string; batteryNo: string; vehicleId: number; noOfDays: number; color: string }[]>([]);
  const [chassisLoading, setChassisLoading] = useState(false);
  const [allotmentLoading, setAllotmentLoading] = useState(false);
  // const [saveBookingAfterAllotLoading, setSaveBookingAfterAllotLoading] = useState(false); // hidden for now
  const [selfManagedInsurance, setSelfManagedInsurance] = useState(false);

  // Part ID visibility toggle (like Model ID)
  const [showPartId, setShowPartId] = useState(false);

  // Cascading vehicle dropdown state
  const [vehicleCatalogOptions, setVehicleCatalogOptions] = useState<{
    brands: string[];
    models: string[];
    submodels: { value: string; label: string }[];
    variants: { value: string; label: string; modelId: string; partIds: string[]; originalVariant: string }[];
  }>({
    brands: [],
    models: [],
    submodels: [],
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

  const { data: otpData } = useQuery({
    queryKey: ['tvs-otp'],
    queryFn: () => otpConfigApi.getOtp(),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const saved = otpData?.data?.data?.tvs_otp ?? otpData?.data?.tvs_otp ?? '';
    if (saved) setOtpValue(String(saved));
  }, [otpData]);

  const updateOtpMutation = useMutation({
    mutationFn: (otp: string) => otpConfigApi.updateOtp(otp),
    onSuccess: (_data, otp) => {
      toast({ title: 'OTP Updated', description: `TVS OTP set to ${otp}` });
      setIsUpdatingOtp(false);
      setOtpValue(otp);
      queryClient.invalidateQueries({ queryKey: ['tvs-otp'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update OTP',
        variant: 'destructive',
      });
      setIsUpdatingOtp(false);
    },
  });

  const handleOtpUpdate = () => {
    if (!otpValue || !/^\d{4}$/.test(otpValue)) {
      toast({
        title: 'Invalid OTP',
        description: 'OTP must be exactly 4 digits',
        variant: 'destructive',
      });
      return;
    }
    setIsUpdatingOtp(true);
    updateOtpMutation.mutate(otpValue);
  };

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

  // Confirm Booking (LEGACY — API path, detached from Perform Booking button)
  const handleConfirmBooking = async () => {
    if (!bookingConfirmData || !fetchedEnquiryNo) return;
    setShowBookingConfirm(false);
    setPerformBookingLoading(true);

    const { lineItemData } = bookingConfirmData;
    const confirmedAmount = bookingConfirmData.bookingAmt;

    try {
      // ── Step 1: SaveVoucher (1st) — uses BOOK_PART_ID as DOCUMENT_ID ──
      toast({ title: 'Submitting voucher (1/2)...', description: 'Creating pre-booking payment voucher.' });
      try {
        const v1 = await externalApi.submitVoucher({
          bookingAmount: confirmedAmount,
          lineItemData,
          enquiryId: fetchedEnquiryNo!,
        });
        if (v1.data.success) {
          toast({ title: 'Voucher 1 submitted', description: 'Pre-booking voucher created.' });
        } else {
          toast({ title: 'Voucher 1 warning', description: v1.data.error || 'Pre-booking voucher may have failed.', variant: 'destructive' });
        }
      } catch (v1Err: any) {
        console.error('Voucher 1 error:', v1Err);
        toast({ title: 'Voucher 1 failed', description: 'Pre-booking voucher failed. Continuing with booking...', variant: 'destructive' });
      }

      // ── Step 2: SaveBooking with confirmed values ──
      toast({ title: 'Saving booking...', description: 'Submitting booking to TVS.' });
      const saveResponse = await externalApi.saveBooking({
        bookingData: {
          BOOKING_AMT: confirmedAmount,
          TOT_UNIT_PRICE: bookingConfirmData.unitPrice * bookingConfirmData.quantity,
          TOT_ACC_CHRGS: bookingConfirmData.accCharges,
          TOT_REG_CHRGS: bookingConfirmData.regCharges,
          TOT_LINE_DISC: bookingConfirmData.discount + bookingConfirmData.manualDiscount,
          INS_CHARGES: bookingConfirmData.insCharges,
        },
        lineItemData,
        enquiryId: fetchedEnquiryNo,
      });

      if (saveResponse.data.success) {
        const sbData = saveResponse.data.data;
        setSaveBookingResponse(sbData);
        const bd = sbData?.BookingDet || sbData;
        const bookingNo = bd.BOOKING_NO || bd.BOOKING_ID;

        // ── Step 3: SaveVoucher (2nd) — uses BOOKING_NO as DOCUMENT_ID ──
        toast({ title: 'Submitting voucher (2/2)...', description: 'Creating post-booking payment voucher.' });
        try {
          const v2 = await externalApi.submitVoucher({
            saveBookingResponse: sbData,
            bookingAmount: confirmedAmount,
            lineItemData,
            documentIdOverride: bookingNo,
            enquiryId: fetchedEnquiryNo!,
          });
          if (v2.data.success) {
            toast({ title: 'All steps complete', description: 'Booking saved and both vouchers submitted successfully.' });
          } else {
            toast({ title: 'Voucher failed — Vehicle may not be in stock', description: v2.data.error || 'Booking was saved but payment voucher failed. Please verify vehicle stock availability.', variant: 'destructive' });
          }
        } catch (v2Err: any) {
          console.error('Voucher 2 error:', v2Err);
          toast({ title: 'Voucher failed — Vehicle may not be in stock', description: 'Booking was saved but payment voucher failed. Please verify vehicle stock availability.', variant: 'destructive' });
        }

        setBookingSectionUnlocked(true);
        setBookingAmount(String(confirmedAmount));

        const partDetails = bd.BookPartDetailsList?.[0] || {};
        const updatedVehicleDetails = {
          ...formData['vehicle_details'],
          booking_amount: confirmedAmount,
          booking_no: bookingNo || partDetails.BOOK_PART_ID || lineItemData?.BOOK_PART_ID || '',
          _bookPartId: partDetails.BOOK_PART_ID || lineItemData?.BOOK_PART_ID || '',
          _vehicleId: partDetails.VEHICLE_ID || 0,
          _customerId: bd.CUSTOMER_ID || 0,
          _partId: partDetails.PART_ID || lineItemData?.PART_ID || '',
          _modelId: partDetails.MODEL_ID || lineItemData?.MODEL_ID || '',
          _bookingDone: true,
        };
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          vehicle_details: updatedVehicleDetails,
        }));
        await autoSaveVehicleDetails(updatedVehicleDetails);
      } else {
        toast({ title: 'Booking failed', description: saveResponse.data.error || 'Failed to save booking.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Perform booking error:', error);
      toast({ title: 'Booking failed', description: error.response?.data?.error || 'Failed to perform booking.', variant: 'destructive' });
    } finally {
      setPerformBookingLoading(false);
    }
  };

  // Poll job runner until Playwright automation completes
  const pollAutomationJob = async (jobId: string, maxAttempts = 120): Promise<'completed' | 'failed'> => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResp = await jobApi.getJobStatus(jobId);
      const status = statusResp.data?.status;
      if (status === 'completed') return 'completed';
      if (status === 'failed') return 'failed';
    }
    return 'failed';
  };

  // Perform Booking via Playwright UI automation (replaces direct TVS POST APIs)
  const handlePerformBookingViaAutomation = async (options?: { requireStock?: boolean }) => {
    if (!bookingAmount) {
      toast({ title: 'Booking amount required', description: 'Please enter the booking amount to proceed.', variant: 'destructive' });
      return;
    }
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number', description: 'Fetch enquiry details on Tab 1 first.', variant: 'destructive' });
      return;
    }

    const vehicleData = formData['vehicle_details'] || {};
    const vehicleVariant = vehicleData._variantName || vehicleData.variant || '';
    const vehicleSubmodel = vehicleData._submodelLabel || vehicleData.submodel || '';

    if (options?.requireStock) {
      const stock = parseInt(String(vehicleData.stock_available ?? ''), 10);
      if (!Number.isFinite(stock) || stock < 1) {
        toast({
          title: 'No stock available',
          description: 'Vehicle stock must be 1 or more to perform booking with chassis.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (!vehicleVariant) {
      toast({ title: 'Vehicle not selected', description: 'Pick a Brand / Model / Variant before performing booking.', variant: 'destructive' });
      return;
    }
    if (!vehicleSubmodel) {
      toast({ title: 'SubModel not selected', description: 'Pick a SubModel before performing booking.', variant: 'destructive' });
      return;
    }

    setPerformBookingLoading(true);
    try {
      let otp = '';
      try {
        const otpResp = await otpConfigApi.getOtp();
        console.log('[Perform Booking] OTP fetch response:', otpResp.data);
        otp = String(otpResp.data?.data?.tvs_otp ?? otpResp.data?.tvs_otp ?? '').trim();
      } catch (otpErr: any) {
        console.error('[Perform Booking] OTP fetch failed:', otpErr);
        const detail = otpErr.response?.data?.error || otpErr.message || 'Unknown error';
        toast({
          title: 'Could not read TVS OTP',
          description: `${detail}. Check that job_runner.py is running and the OTP is set on Dashboard.`,
          variant: 'destructive',
        });
        setPerformBookingLoading(false);
        return;
      }

      if (!otp) {
        toast({
          title: 'TVS OTP not set',
          description: 'Set the TVS OTP on Dashboard before performing booking.',
          variant: 'destructive',
        });
        setPerformBookingLoading(false);
        return;
      }
      console.log('[Perform Booking] using OTP:', otp);

      toast({ title: 'Starting UI automation...', description: 'Headless browser is performing booking on TVS portal.' });
      const headlessPref = (() => {
        const stored = window.localStorage.getItem('tvs_automation_headless');
        return stored === null ? true : stored === 'true';
      })();

      const startResp = await jobApi.runBooking({
        enquiryNo: fetchedEnquiryNo,
        bookingAmount,
        otp,
        submodel: vehicleSubmodel,
        vehicle: vehicleVariant,
        headless: headlessPref,
      });

      if (!startResp.data.success || !startResp.data.jobId) {
        toast({
          title: 'Automation failed to start',
          description: startResp.data.error || startResp.data.hint || 'Job runner may not be running.',
          variant: 'destructive',
        });
        return;
      }

      const jobId = startResp.data.jobId;
      const result = await pollAutomationJob(jobId);

      if (result === 'completed') {
        setBookingSectionUnlocked(true);
        toast({ title: 'Booking automation complete', description: 'Fetching booked details from TVS...' });
        await handleSearchBooking();
        setFormData((prev: Record<string, any>) => {
          const vehicle_details = {
            ...(prev.vehicle_details || {}),
            _bookingVehicleSnapshot: {
              submodel: vehicleSubmodel,
              variant: vehicleVariant,
            },
          };
          void autoSaveVehicleDetails(vehicle_details);
          return { ...prev, vehicle_details };
        });
      } else {
        const statusResp = await jobApi.getJobStatus(jobId);
        toast({
          title: 'Booking automation failed',
          description: 'Check job runner logs for details.',
          variant: 'destructive',
        });
        console.error('Playwright booking job output:', statusResp.data?.output);
      }
    } catch (error: any) {
      console.error('Perform booking automation error:', error);
      toast({
        title: 'Automation error',
        description: error.response?.data?.error || error.response?.data?.hint || 'Failed to run booking automation.',
        variant: 'destructive',
      });
    } finally {
      setPerformBookingLoading(false);
    }
  };

  // Perform Allotment via Playwright UI automation (replaces direct TVS POST APIs)
  const handlePerformAllotmentViaAutomation = async () => {
    const vehicleData = formData['vehicle_details'] || {};
    const selectedChassis = vehicleData.chassis_no;
    const vehicleVariant = vehicleData._variantName || vehicleData.variant || '';
    const vehicleSubmodel = vehicleData._submodelLabel || vehicleData.submodel || '';

    if (!selectedChassis) {
      toast({ title: 'No chassis selected', description: 'Please select a chassis number first.', variant: 'destructive' });
      return;
    }
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry number', description: 'Fetch enquiry details first.', variant: 'destructive' });
      return;
    }
    if (!vehicleData.booking_no) {
      toast({ title: 'Booking number required', description: 'Complete Perform Booking first so booking_no is populated.', variant: 'destructive' });
      return;
    }
    if (!vehicleVariant) {
      toast({ title: 'Variant not selected', description: 'Pick a Variant on Screen 3 before performing allotment.', variant: 'destructive' });
      return;
    }
    if (!vehicleSubmodel) {
      toast({ title: 'SubModel not selected', description: 'Pick a SubModel on Screen 3 before performing allotment.', variant: 'destructive' });
      return;
    }

    setAllotmentLoading(true);
    try {
      let otp = '';
      try {
        const otpResp = await otpConfigApi.getOtp();
        otp = String(otpResp.data?.data?.tvs_otp ?? otpResp.data?.tvs_otp ?? '').trim();
      } catch (otpErr: any) {
        console.error('[Perform Allotment] OTP fetch failed:', otpErr);
        const detail = otpErr.response?.data?.error || otpErr.message || 'Unknown error';
        toast({
          title: 'Could not read TVS OTP',
          description: `${detail}. Check that job_runner.py is running and the OTP is set on Dashboard.`,
          variant: 'destructive',
        });
        setAllotmentLoading(false);
        return;
      }

      if (!otp) {
        toast({
          title: 'TVS OTP not set',
          description: 'Set the TVS OTP on Dashboard before performing allotment.',
          variant: 'destructive',
        });
        setAllotmentLoading(false);
        return;
      }

      toast({ title: 'Starting allotment automation...', description: 'Headless browser is performing allotment on TVS portal.' });
      const headlessPref = (() => {
        const stored = window.localStorage.getItem('tvs_automation_headless');
        return stored === null ? true : stored === 'true';
      })();

      const normVehicleLabel = (v: string) => String(v).trim().toLowerCase();
      const bookingSnap = vehicleData._bookingVehicleSnapshot as { submodel?: string; variant?: string } | undefined;
      const skipVehicleSelect = !!(
        bookingSnap &&
        normVehicleLabel(bookingSnap.submodel || '') === normVehicleLabel(vehicleSubmodel) &&
        normVehicleLabel(bookingSnap.variant || '') === normVehicleLabel(vehicleVariant)
      );
      const stockCount = parseInt(String(vehicleData.stock_available ?? ''), 10);
      const singleFrameStock = stockCount === 1;

      if (skipVehicleSelect) {
        console.log('[Perform Allotment] SubModel/Variant unchanged since booking — skip vehicle select');
      }
      if (singleFrameStock) {
        console.log('[Perform Allotment] single frame in stock — soft-check chassis only');
      }

      const startResp = await jobApi.runAllotment({
        enquiryNo: fetchedEnquiryNo,
        chassisNo: selectedChassis,
        bookingNo: vehicleData.booking_no || '',
        submodel: vehicleSubmodel,
        vehicle: vehicleVariant,
        otp,
        skipVehicleSelect,
        singleFrameStock,
        headless: headlessPref,
      });

      if (!startResp.data.success || !startResp.data.jobId) {
        toast({
          title: 'Automation failed to start',
          description: startResp.data.error || startResp.data.hint || 'Job runner may not be running.',
          variant: 'destructive',
        });
        return;
      }

      const jobId = startResp.data.jobId;
      const result = await pollAutomationJob(jobId);

      if (result === 'completed') {
        const selectedFrame = chassisOptions.find((f) => f.value === selectedChassis);
        const updatedVehicleDetails = {
          ...formData['vehicle_details'],
          _allotmentDone: true,
          _frameNumber: selectedChassis,
          _engineNo: selectedFrame?.engineNo || vehicleData.engine_no || '',
          chassis_no: selectedChassis,
          engine_no: selectedFrame?.engineNo || vehicleData.engine_no || '',
          key_no: selectedFrame?.keyNo || vehicleData.key_no || '',
          battery_no: selectedFrame?.batteryNo || vehicleData.battery_no || '',
        };
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          vehicle_details: updatedVehicleDetails,
        }));
        await autoSaveVehicleDetails(updatedVehicleDetails);
        toast({ title: 'Allotment automation complete', description: 'Vehicle allotment completed via TVS UI.' });
      } else {
        const statusResp = await jobApi.getJobStatus(jobId);
        toast({
          title: 'Allotment automation failed',
          description: 'Check job runner logs for details.',
          variant: 'destructive',
        });
        console.error('Playwright allotment job output:', statusResp.data?.output);
      }
    } catch (error: any) {
      console.error('Perform allotment automation error:', error);
      toast({
        title: 'Automation error',
        description: error.response?.data?.error || error.response?.data?.hint || 'Failed to run allotment automation.',
        variant: 'destructive',
      });
    } finally {
      setAllotmentLoading(false);
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
        const tvsCascade = response.data.tvsCascade;
        console.log('Pre-booking response data keys:', Object.keys(response.data.data || {}));
        console.log('Pre-booking mappedFields:', JSON.stringify(mapped, null, 2));
        console.log('Pre-booking tvsCascade:', JSON.stringify(tvsCascade, null, 2));
        
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

        // Apply TVS Model → SubModel → Variant cascade from backend resolver
        if (tvsCascade?.resolved && tvsCascade.cascade) {
          const c = tvsCascade.cascade;
          if (!newFormData['vehicle_details']) newFormData['vehicle_details'] = {};
          newFormData['vehicle_details'] = {
            ...newFormData['vehicle_details'],
            brand: c.brand,
            _tvsCatalogLoaded: true,
            model: c.model,
            submodel: c.submodel,
            _submodelLabel: c.submodelLabel,
            model_id: c.modelId,
            variant: c.variant || newFormData['vehicle_details'].variant || '',
            _variantPartId: c.partId || '',
            _variantModelId: c.modelId,
            _variantName: c.variant || '',
            _partId: c.partId || '',
          };

          if (tvsCascade.catalogOptions) {
            setVehicleCatalogOptions({
              brands: ['TVS'],
              models: (tvsCascade.catalogOptions.groups || []).map((g: { value: string }) => g.value),
              submodels: (tvsCascade.catalogOptions.submodels || []).map((s: { value: string; label: string }) => ({
                value: s.value,
                label: s.label,
              })),
              variants: tvsCascade.catalogOptions.variants || [],
            });
          }
        } else if (tvsCascade?.catalogOptions?.groups?.length) {
          setVehicleCatalogOptions((prev) => ({
            ...prev,
            brands: ['TVS'],
            models: tvsCascade.catalogOptions.groups.map((g: { value: string }) => g.value),
          }));
        }
        
        // Store CGST/SGST metadata for cross-check validation (also persisted inside amounts_tax)
        if (mapped['_cgst_perc'] !== undefined) {
          setCgstMeta({ perc: mapped['_cgst_perc'], applied: mapped['_cgst_applied'], value: mapped['_cgst_value'] });
          if (!newFormData['amounts_tax']) newFormData['amounts_tax'] = {};
          newFormData['amounts_tax']._cgstMeta = { perc: mapped['_cgst_perc'], applied: mapped['_cgst_applied'], value: mapped['_cgst_value'] };
          if (!newFormData['vehicle_details']) newFormData['vehicle_details'] = {};
          newFormData['vehicle_details']._cgstPerc = mapped['_cgst_perc'];
        }
        if (mapped['_sgst_perc'] !== undefined) {
          setSgstMeta({ perc: mapped['_sgst_perc'], applied: mapped['_sgst_applied'], value: mapped['_sgst_value'] });
          if (!newFormData['amounts_tax']) newFormData['amounts_tax'] = {};
          newFormData['amounts_tax']._sgstMeta = { perc: mapped['_sgst_perc'], applied: mapped['_sgst_applied'], value: mapped['_sgst_value'] };
          if (!newFormData['vehicle_details']) newFormData['vehicle_details'] = {};
          newFormData['vehicle_details']._sgstPerc = mapped['_sgst_perc'];
        }

        console.log('Pre-booking updated formData:', JSON.stringify(newFormData, null, 2));

        const resolvedPartId =
          tvsCascade?.cascade?.partId ||
          newFormData['vehicle_details']?._variantPartId ||
          newFormData['vehicle_details']?._partId;

        if (resolvedPartId) {
          const framePatch = await loadFramesForPart(String(resolvedPartId), { toastOnResult: false });
          if (framePatch && newFormData['vehicle_details']) {
            newFormData['vehicle_details'] = {
              ...newFormData['vehicle_details'],
              ...framePatch,
            };
          }
        }

        newFormData['amounts_tax'] = buildSyncedAmountsTax(
          newFormData['vehicle_details'] || {},
          newFormData['amounts_tax'] || {}
        );

        setFormData(newFormData);

        // Persist vehicle_details and amounts_tax to DB so they survive refresh
        if (newFormData['vehicle_details']) {
          await autoSaveVehicleDetails(newFormData['vehicle_details']);
        }
        if (newFormData['amounts_tax']) {
          await autoSaveTab('amounts_tax', newFormData['amounts_tax']);
        }
        
        setPreBookingDone(true);

        const cascadeMsg = tvsCascade?.resolved
          ? `Model: ${tvsCascade.cascade?.model}, SubModel and Variant auto-selected.`
          : 'Amounts and IDs populated.';
        const frameCount = newFormData['vehicle_details']?.stock_available;
        const frameMsg =
          resolvedPartId && frameCount !== undefined && frameCount !== ''
            ? ` ${frameCount} frame(s) in stock.`
            : '';
        const warnMsg = tvsCascade?.warnings?.length ? ` Note: ${tvsCascade.warnings.join('; ')}` : '';
        toast({
          title: 'Pre-booking data fetched & applied',
          description: `${cascadeMsg}${frameMsg} Please verify.${warnMsg}`,
        });
      } else {
        toast({ title: 'Error', description: response.data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to fetch pre-booking data', variant: 'destructive' });
    } finally {
      setPreBookingLoading(false);
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
    
    // Track if this enquiry is already booked → lock user on tab 0
    const bookedFlag = data['_booked'] ?? rawData?.Booked ?? 0;
    const statusDesc = (data['_status'] || rawData?.STATUS_DESC || '').toLowerCase();
    const _isBooked = bookedFlag === 1 || statusDesc === 'booked';
    setIsEnquiryBooked(_isBooked);
    if (_isBooked) {
      toast({ title: 'Enquiry already booked', description: 'This enquiry has an existing booking. Navigation to other tabs is blocked.', variant: 'destructive' });
    }
    
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
      const fd = sub.formData || {};
      setFormData({
        ...fd,
        amounts_tax: buildSyncedAmountsTax(fd['vehicle_details'] || {}, fd['amounts_tax'] || {}),
      });
      // Restore fetchedEnquiryNo from saved form data
      const savedEnquiryNo = sub.formData?.customer_enquiry?.enquiry_no;
      if (savedEnquiryNo && !fetchedEnquiryNo) {
        setFetchedEnquiryNo(String(savedEnquiryNo));
      }
      // Restore booked-enquiry lock from saved enquiry_status
      const savedStatus = (sub.formData?.customer_enquiry?.enquiry_status || '').toLowerCase();
      if (savedStatus === 'booked') {
        setIsEnquiryBooked(true);
      }
      // Restore self-managed insurance flag
      if (sub.formData?.insurance_nominee_demographics?._selfManaged) {
        setSelfManagedInsurance(true);
      }
      // Restore CGST/SGST cross-check metadata from persisted amounts_tax
      const savedAmounts = sub.formData?.amounts_tax;
      if (savedAmounts?._cgstMeta) {
        setCgstMeta(savedAmounts._cgstMeta);
      }
      if (savedAmounts?._sgstMeta) {
        setSgstMeta(savedAmounts._sgstMeta);
      }
      setCurrentTab(sub.currentTabIndex || 0);
      setIsInitialLoad(false);
    }
  }, [submissionData, isInitialLoad]);

  // Keep Screen 4 amounts in sync with Screen 3 pricing and life tax
  useEffect(() => {
    const vd = formData['vehicle_details'];
    if (!vd || Object.keys(vd).length === 0) return;

    setFormData((prev) => {
      const synced = buildSyncedAmountsTax(vd, prev['amounts_tax'] || {});
      const current = prev['amounts_tax'] || {};
      if (
        current.base_amount === synced.base_amount &&
        current.life_tax_amount === synced.life_tax_amount &&
        current.total_amount === synced.total_amount
      ) {
        return prev;
      }
      return { ...prev, amounts_tax: { ...current, ...synced } };
    });
  }, [
    formData['vehicle_details']?.ex_showroom_price,
    formData['vehicle_details']?.cgst_amount,
    formData['vehicle_details']?.sgst_amount,
    formData['vehicle_details']?.vehicle_total_price,
    formData['vehicle_details']?.life_time_tax,
  ]);

  // Start new submission
  useEffect(() => {
    if (flowId && !submissionId && flowData?.data?.data) {
      startMutation.mutate(flowId);
    }
  }, [flowId, submissionId, flowData]);

  // Load cascading vehicle catalog options
  const loadTvsCatalogGroups = async (preserveSelections = false) => {
    setCatalogLoading(prev => ({ ...prev, tvs: true, model: true }));
    try {
      const response = await externalApi.formatVehicleModel({
        action: 'load',
        enquiryId: fetchedEnquiryNo || undefined,
      });
      if (response.data.success) {
        const groups: Array<{ value: string; label: string }> = response.data.data?.groups || [];
        setVehicleCatalogOptions(prev => ({
          ...prev,
          models: groups.map((g) => g.value),
          ...(preserveSelections ? {} : { submodels: [], variants: [] }),
        }));
        setFormData(prev => ({
          ...prev,
          vehicle_details: {
            ...prev['vehicle_details'],
            brand: 'TVS',
            _tvsCatalogLoaded: true,
            ...(preserveSelections
              ? {}
              : {
                  model: '',
                  submodel: '',
                  variant: '',
                  _variantPartId: '',
                  _variantModelId: '',
                  _variantName: '',
                  _submodelLabel: '',
                }),
          },
        }));
        return groups.length;
      }
      toast({
        title: 'Failed to load TVS catalog',
        description: response.data.error || 'Unknown error',
        variant: 'destructive',
      });
      return 0;
    } catch (error: any) {
      const msg = error?.response?.data?.error || error.message || 'Request failed';
      toast({
        title: error?.response?.status === 404 ? 'Template not captured' : 'TVS catalog error',
        description: msg,
        variant: 'destructive',
      });
      return 0;
    } finally {
      setCatalogLoading(prev => ({ ...prev, tvs: false, model: false }));
    }
  };

  const handleSelectTvs = async () => {
    const count = await loadTvsCatalogGroups(false);
    if (count > 0) {
      toast({
        title: 'TVS catalog loaded',
        description: `${count} model group(s) ready — pick Model, then SubModel`,
      });
    }
  };

  const loadCascadingOptions = async (fieldName: string, vehicleData: Record<string, any>) => {
    setCatalogLoading(prev => ({ ...prev, [fieldName]: true }));
    try {
      const brand = vehicleData?.brand || '';
      const model = vehicleData?.model || '';
      const tvsCatalogLoaded = !!vehicleData?._tvsCatalogLoaded;

      if (fieldName === 'brand') {
        const response = await vehicleCatalogApi.getBrands();
        const allBrands: string[] = response.data.data || [];
        // Screen 3 only supports TVS bookings; hide any other brand from the dropdown.
        const filtered = allBrands.filter((b) => b === 'TVS');
        setVehicleCatalogOptions(prev => ({ ...prev, brands: filtered }));
      } else if (fieldName === 'model' && brand) {
        if (tvsCatalogLoaded && brand === 'TVS') return;
        const response = await vehicleCatalogApi.getModels(brand);
        setVehicleCatalogOptions(prev => ({ ...prev, models: response.data.data || [] }));
      } else if (fieldName === 'submodel' && brand && model) {
        if (tvsCatalogLoaded && brand === 'TVS') {
          const response = await externalApi.formatVehicleModel({ group: model });
          if (response.data.success) {
            const submodels: Array<{ value: string; label: string }> = response.data.data?.submodels || [];
            setVehicleCatalogOptions(prev => ({
              ...prev,
              submodels: submodels.map((o) => ({ value: o.value, label: o.label })),
            }));
          } else {
            setVehicleCatalogOptions(prev => ({ ...prev, submodels: [] }));
          }
        } else {
          setVehicleCatalogOptions(prev => ({ ...prev, submodels: [] }));
        }
      } else if (fieldName === 'variant' && brand && model) {
        if (tvsCatalogLoaded && brand === 'TVS') {
          const modelId = vehicleData.submodel || vehicleData.model_id;
          if (!modelId) return;
          const response = await externalApi.fetchModelParts({ modelId: String(modelId), countryCode: 'IN' });
          if (response.data.success) {
            const rawVariants: Array<{
              value: string;
              label: string;
              modelId: string;
              partId: string;
              partIds: string[];
              originalVariant: string;
            }> = response.data.data?.variants || [];
            setVehicleCatalogOptions(prev => ({ ...prev, variants: rawVariants }));
          } else {
            setVehicleCatalogOptions(prev => ({ ...prev, variants: [] }));
          }
        } else {
          const response = await vehicleCatalogApi.getVariants(brand, model);
          const rawVariants = response.data.data || [];
          const mapped = rawVariants.map((v: any) =>
            typeof v === 'string'
              ? { value: v, label: v, modelId: '', partIds: [] as string[], originalVariant: v }
              : {
                  value: `${v.modelId || ''}|||${v.variant || ''}`,
                  label: v.label || v.variant,
                  modelId: v.modelId || '',
                  partIds: v.partIds || (v.partId ? [v.partId] : []),
                  originalVariant: v.variant || '',
                }
          );
          setVehicleCatalogOptions(prev => ({ ...prev, variants: mapped }));
        }
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

      if (vehicleData._tvsCatalogLoaded && vehicleData.brand === 'TVS') {
        loadTvsCatalogGroups(true);
        if (vehicleData.model) {
          loadCascadingOptions('submodel', vehicleData);
        }
        if (vehicleData.submodel || vehicleData.model_id) {
          loadCascadingOptions('variant', vehicleData);
        }
      } else if (vehicleData.brand && vehicleData.brand !== 'TVS') {
        loadCascadingOptions('model', vehicleData);
        if (vehicleData.model) {
          loadCascadingOptions('variant', vehicleData);
        }
      }
    }
  }, [currentTab, flowScreens.length]);

  // Auto-unlock post-booking section & restore allotment state if data already exists (returning to saved form)
  useEffect(() => {
    const screenCode = flowScreens[currentTab]?.screen?.code;
    if (screenCode === 'vehicle_details') {
      const vehicleData = formData['vehicle_details'] || {};
      if (vehicleData.booking_no) {
        setBookingSectionUnlocked(true);
        if (vehicleData.booking_amount) setBookingAmount(String(vehicleData.booking_amount));
      }
      if (vehicleData._bookingDone) {
        setBookingSectionUnlocked(true);
      }
      if (vehicleData._allotmentDone) {
        setPreBookingDone(true);
      }
    }
  }, [currentTab, flowScreens.length]);

  // Fetch chassis frames via LoadVehicleFrameforAllotment — auto on Variant select or manual refresh
  const loadFramesForPart = async (
    partId: string | undefined,
    options?: { toastOnResult?: boolean },
  ): Promise<{ stock_available: number; chassis_no: string; engine_no: string; _partId?: string } | null> => {
    if (!fetchedEnquiryNo) {
      if (options?.toastOnResult !== false) {
        toast({ title: 'No enquiry number', description: 'Fetch enquiry details on Tab 1 first.', variant: 'destructive' });
      }
      return null;
    }
    if (!partId) {
      setChassisOptions([]);
      return null;
    }

    setChassisLoading(true);
    try {
      const resp = await externalApi.loadVehicleFrames({
        enquiryId: fetchedEnquiryNo,
        partId,
      });
      const frames: any[] = resp.data.data || [];
      const count = frames.length;

      const mappedFrames = frames.map((f: any) => ({
        value: f.value || '',
        label: f.engineNo
          ? `${f.value} — Engine: ${f.engineNo}`
          : (f.label || f.value || ''),
        engineNo: f.engineNo || '',
        keyNo: f.keyNo || '',
        batteryNo: f.batteryNo || '',
        vehicleId: f.vehicleId || 0,
        noOfDays: f.noOfDays || 0,
        color: f.description || '',
      }));

      setChassisOptions(mappedFrames);
      const patch = {
        stock_available: count,
        _partId: partId,
        chassis_no: '',
        engine_no: '',
      };
      setFormData((prev) => ({
        ...prev,
        vehicle_details: {
          ...prev['vehicle_details'],
          ...patch,
        },
      }));

      if (options?.toastOnResult !== false) {
        if (count > 0) {
          toast({
            title: `${count} frame(s) in stock`,
            description: 'Select chassis and engine from the dropdown below.',
          });
        } else {
          toast({
            title: 'No frames available',
            description: 'No chassis numbers found for this variant.',
            variant: 'destructive',
          });
        }
      }
      return patch;
    } catch (err: any) {
      console.error('Failed to load vehicle frames:', err);
      setChassisOptions([]);
      const patch = { stock_available: 0, chassis_no: '', engine_no: '' };
      setFormData((prev) => ({
        ...prev,
        vehicle_details: {
          ...prev['vehicle_details'],
          ...patch,
        },
      }));
      if (options?.toastOnResult !== false) {
        toast({
          title: 'Frame load failed',
          description: err.response?.data?.error || 'Could not fetch chassis numbers.',
          variant: 'destructive',
        });
      }
      return patch;
    } finally {
      setChassisLoading(false);
    }
  };

  const handleFetchChassis = async () => {
    const vehicleData = formData['vehicle_details'] || {};
    const partId = vehicleData._variantPartId || vehicleData._partId;
    await loadFramesForPart(partId);
  };

  /* Perform vehicle allotment (LEGACY — API path, detached from button)
  const handlePerformAllotment = async () => {
    const vehicleData = formData['vehicle_details'] || {};
    const selectedChassis = vehicleData.chassis_no;

    console.log('Allotment: chassis_no from formData =', selectedChassis);
    console.log('Allotment: chassisOptions count =', chassisOptions.length);
    console.log('Allotment: chassisOptions values =', chassisOptions.map(f => f.value));

    if (!selectedChassis) {
      toast({ title: 'No chassis selected', description: 'Please select a chassis number first.', variant: 'destructive' });
      return;
    }

    const selectedFrame = chassisOptions.find(f => f.value === selectedChassis);
    console.log('Allotment: matched frame =', selectedFrame ? { value: selectedFrame.value, vehicleId: selectedFrame.vehicleId, noOfDays: selectedFrame.noOfDays } : 'NOT FOUND');

    if (!selectedFrame) {
      toast({ title: 'Chassis data not found', description: `Chassis "${selectedChassis}" not in loaded options. Please re-fetch and select again.`, variant: 'destructive' });
      return;
    }

    setAllotmentLoading(true);
    try {
      const vehicleDetailsData = formData['vehicle_details'] || {};
      const resp = await externalApi.performAllotment({
        frameNumber: selectedFrame.value,
        vehicleId: selectedFrame.vehicleId,
        noOfDays: selectedFrame.noOfDays,
        engineNo: selectedFrame.engineNo,
        bookingNo: vehicleDetailsData.booking_no || '',
        enquiryId: fetchedEnquiryNo || undefined,
      });

      if (resp.data.success) {
        toast({ title: 'Allotment successful', description: resp.data.message || 'Vehicle allotment completed.' });

        const allotData = resp.data.data || {};
        const updatedVehicleDetails = {
          ...formData['vehicle_details'],
          _allotmentDone: true,
          _frameNumber: selectedFrame.value,
          _engineNo: selectedFrame.engineNo,
          _vehicleId: selectedFrame.vehicleId,
          _allotVehId: allotData.ALLOT_VEH_ID || allotData.AllotmentId || 0,
          chassis_no: selectedFrame.value,
          engine_no: selectedFrame.engineNo,
          key_no: selectedFrame.keyNo || '',
          battery_no: selectedFrame.batteryNo || '',
        };
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          vehicle_details: updatedVehicleDetails,
        }));
        await autoSaveVehicleDetails(updatedVehicleDetails);
      } else {
        toast({ title: 'Allotment failed', description: resp.data.error || 'Could not perform allotment.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Allotment error:', err);
      toast({ title: 'Allotment failed', description: err.response?.data?.error || 'Could not perform allotment.', variant: 'destructive' });
    } finally {
      setAllotmentLoading(false);
    }
  };
  */

  /* Save booking after allotment — hidden for now, kept for future use
  const handleSaveBookingAfterAllotment = async () => {
    if (!fetchedEnquiryNo) {
      toast({ title: 'No enquiry', description: 'No enquiry number available.', variant: 'destructive' });
      return;
    }
    setSaveBookingAfterAllotLoading(true);
    try {
      const resp = await externalApi.saveBookingAfterAllotment({ enquiryId: fetchedEnquiryNo });
      if (resp.data.success) {
        toast({ title: 'Booking saved', description: resp.data.message || 'Booking saved after allotment successfully.' });

        const updatedVehicleDetails = {
          ...formData['vehicle_details'],
          _postAllotmentSaved: true,
        };
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          vehicle_details: updatedVehicleDetails,
        }));
        await autoSaveVehicleDetails(updatedVehicleDetails);
      } else {
        toast({ title: 'Save booking failed', description: resp.data.error || 'Could not save booking.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Save booking after allotment error:', err);
      toast({ title: 'Save booking failed', description: err.response?.data?.error || 'Could not save booking after allotment.', variant: 'destructive' });
    } finally {
      setSaveBookingAfterAllotLoading(false);
    }
  };
  */

  // Fetch booked details by phone number (SearchBooking) and populate Tab 3 fields
  const handleSearchBooking = async () => {
    const customerData = formData['customer_enquiry'] || {};
    const phoneNo = customerData.mobile_no || '';
    if (!phoneNo) {
      toast({ title: 'No phone number', description: 'Fetch enquiry details on Tab 1 first to get the customer phone number.', variant: 'destructive' });
      return;
    }
    try {
      const resp = await externalApi.searchBooking({
        contactNo: phoneNo,
        enquiryId: fetchedEnquiryNo || undefined,
      });
      if (resp.data.success && resp.data.data) {
        const d = resp.data.data;
        const updatedVehicleDetails = {
          ...formData['vehicle_details'],
          booking_no: d.bookingNo || d.bookingId || '',
          customer_id: d.customerId || '',
          _bookingDone: true,
          _customerId: d.customerId || 0,
          _searchBookingData: d.raw || {},
        };
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          vehicle_details: updatedVehicleDetails,
        }));
        setBookingSectionUnlocked(true);
        if (!fetchedEnquiryNo && d.enquiryNo) {
          setFetchedEnquiryNo(String(d.enquiryNo));
        }
        await autoSaveVehicleDetails(updatedVehicleDetails);
        toast({
          title: 'Booked details fetched',
          description: resp.data.message || `Booking #${d.bookingNo} — ${d.customerName} — ${d.statusDesc}`,
        });
      } else {
        toast({ title: 'No bookings found', description: resp.data.message || 'No bookings found for this phone number.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('SearchBooking error:', err);
      toast({ title: 'Fetch failed', description: err.response?.data?.error || 'Could not search bookings.', variant: 'destructive' });
    }
  };

  // Auto-save any tab to DB without validation (used after API operations)
  const autoSaveTab = async (screenCode: string, dataOverride?: Record<string, any>) => {
    if (!submission) return;
    const tabIndex = flowScreens.findIndex(
      (fs: FlowScreen) => fs.screen?.code === screenCode
    );
    if (tabIndex === -1) return;
    try {
      await saveMutation.mutateAsync({
        id: submission.id,
        tabIndex,
        data: dataOverride || formData[screenCode] || {},
        screenCode,
      });
    } catch (e) {
      console.warn(`Auto-save ${screenCode} failed:`, e);
    }
  };

  const autoSaveVehicleDetails = async (dataOverride?: Record<string, any>) =>
    autoSaveTab('vehicle_details', dataOverride);

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
      'customer_gender': customerData.gender ? customerData.gender.charAt(0).toUpperCase() + customerData.gender.slice(1) : '',
      'customer_marital_status': customerData.marital_status ? customerData.marital_status.charAt(0).toUpperCase() + customerData.marital_status.slice(1) : '',
      'customer_language': customerData.language ? customerData.language.charAt(0).toUpperCase() + customerData.language.slice(1) : '',
      
      // Invoice/Gate Pass - Vehicle details
      'vehicle_brand': vehicleData.brand || '',
      'vehicle_model': vehicleData.model || '',
      'vehicle_variant': vehicleData.variant || '',
      'vehicle_color': vehicleData.color || '',
      'chassis_number': vehicleData.chassis_no || '',
      'engine_number': vehicleData.engine_no || '',
      'registration_number': vehicleData.registration_type || '',
      
      // Invoice - Amount details
      'base_amount': amountsData.base_amount || getExShowroomInclGstFromVehicle(vehicleData) || '',
      'other_charges': amountsData.other_amount || '',
      'discount_amount': amountsData.discount || '',
      'tax_amount': amountsData.life_tax_amount || vehicleData.life_time_tax || '',
      'total_amount':
        amountsData.total_amount ||
        calcAmountsScreenTotal(
          {
            ...amountsData,
            base_amount: amountsData.base_amount || getExShowroomInclGstFromVehicle(vehicleData),
            life_tax_amount: amountsData.life_tax_amount || vehicleData.life_time_tax,
          },
          parseFloat(String(vehicleData.life_time_tax)) || 0
        ) ||
        '',
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
    
    if (currentScreenCode === 'amounts_tax') {
      const vd = formData['vehicle_details'] || {};
      const at = formData['amounts_tax'] || {};
      if (fieldName === 'base_amount') {
        return getExShowroomInclGstFromVehicle(vd);
      }
      if (fieldName === 'life_tax_amount') {
        return vd.life_time_tax ?? at.life_tax_amount ?? '';
      }
      if (fieldName === 'total_amount') {
        return calcAmountsScreenTotal(
          {
            ...at,
            base_amount: getExShowroomInclGstFromVehicle(vd),
            life_tax_amount: vd.life_time_tax ?? at.life_tax_amount,
          },
          parseFloat(String(vd.life_time_tax)) || 0
        );
      }
      if (fieldName === 'accessories_amount') {
        return at.accessories_amount ?? at.ew_discount ?? '';
      }
    }
    
    return formData[currentScreenCode]?.[fieldName] ?? '';
  };

  const setFieldValue = (fieldName: string, value: any) => {
    // Auto-calculate Vehicle Price when ex-showroom / CGST / SGST changes on Screen 3
    if (
      currentScreenCode === 'vehicle_details' &&
      (fieldName === 'ex_showroom_price' || fieldName === 'cgst_amount' || fieldName === 'sgst_amount')
    ) {
      setFormData((prev) => {
        const vd = { ...prev['vehicle_details'], [fieldName]: value };
        vd.vehicle_total_price = calcVehicleTotalFromParts(vd);
        return {
          ...prev,
          vehicle_details: vd,
          amounts_tax: buildSyncedAmountsTax(vd, prev['amounts_tax']),
        };
      });
      if (errors[fieldName]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
      return;
    }

    if (currentScreenCode === 'vehicle_details' && fieldName === 'life_time_tax') {
      setFormData((prev) => {
        const vd = { ...prev['vehicle_details'], life_time_tax: value };
        return {
          ...prev,
          vehicle_details: vd,
          amounts_tax: buildSyncedAmountsTax(vd, prev['amounts_tax']),
        };
      });
      if (errors[fieldName]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
      return;
    }

    if (currentScreenCode === 'vehicle_details' && fieldName === 'vehicle_total_price') {
      setFormData((prev) => {
        const vd = { ...prev['vehicle_details'], vehicle_total_price: value };
        return {
          ...prev,
          vehicle_details: vd,
          amounts_tax: buildSyncedAmountsTax(vd, prev['amounts_tax']),
        };
      });
      if (errors[fieldName]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
      return;
    }

    // Handle cascading resets for vehicle fields
    if (currentScreenCode === 'vehicle_details' && CASCADING_VEHICLE_FIELDS.includes(fieldName)) {
      const dependentFields: Record<string, string[]> = {
        brand: ['model', 'submodel', 'variant'],
        model: ['submodel', 'variant'],
        submodel: ['variant'],
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
        setVehicleCatalogOptions(prev => ({ ...prev, models: [], submodels: [], variants: [] }));
        setChassisOptions([]);
        setFormData(prev => ({
          ...prev,
          vehicle_details: {
            ...prev['vehicle_details'],
            _tvsCatalogLoaded: false,
            _variantPartId: '',
            _variantModelId: '',
            _variantName: '',
            _submodelLabel: '',
          },
        }));
        if (value && value !== 'TVS') loadCascadingOptions('model', { brand: value });
      } else if (fieldName === 'model') {
        setVehicleCatalogOptions(prev => ({ ...prev, submodels: [], variants: [] }));
        setChassisOptions([]);
        setFormData(prev => ({
          ...prev,
          vehicle_details: {
            ...prev['vehicle_details'],
            _variantPartId: '',
            _variantModelId: '',
            _variantName: '',
            _submodelLabel: '',
          },
        }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) {
          if (vehicleData._tvsCatalogLoaded && vehicleData.brand === 'TVS') {
            loadCascadingOptions('submodel', { ...vehicleData, model: value });
          } else {
            loadCascadingOptions('variant', { ...vehicleData, model: value });
          }
        }
      } else if (fieldName === 'submodel') {
        setVehicleCatalogOptions(prev => ({ ...prev, variants: [] }));
        setChassisOptions([]);
        const selectedSub = vehicleCatalogOptions.submodels.find((s) => s.value === value);
        setFormData(prev => ({
          ...prev,
          vehicle_details: {
            ...prev['vehicle_details'],
            _submodelLabel: selectedSub?.label || value,
            model_id: value || '',
            _variantPartId: '',
            _variantModelId: '',
            _variantName: '',
          },
        }));
        const vehicleData = formData['vehicle_details'] || {};
        if (value) {
          if (vehicleData._tvsCatalogLoaded && vehicleData.brand === 'TVS') {
            loadCascadingOptions('variant', {
              ...vehicleData,
              submodel: value,
              model_id: value,
            });
          } else {
            loadCascadingOptions('variant', { ...vehicleData, submodel: value });
          }
        }
      }
    } else if (
      currentScreenCode === 'amounts_tax' &&
      AMOUNTS_TOTAL_INPUT_FIELDS.includes(fieldName)
    ) {
      setFormData((prev) => {
        const vd = prev['vehicle_details'] || {};
        const at = { ...prev['amounts_tax'], [fieldName]: value };
        return {
          ...prev,
          amounts_tax: buildSyncedAmountsTax(vd, at),
        };
      });
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
    // Skip all validation on insurance tab when self-managed
    if (currentScreenCode === 'insurance_nominee_demographics' && selfManagedInsurance) {
      setErrors({});
      return true;
    }

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
      
      // booking_date: allow up to 2 months in the past
      if (field.fieldType === 'DATE' && field.name === 'booking_date' && value) {
        const selectedDate = new Date(value);
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        twoMonthsAgo.setHours(0, 0, 0, 0);
        if (selectedDate < twoMonthsAgo) {
          newErrors[field.name] = field.validationMessage || 'Date cannot be more than 2 months in the past';
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
    if (isEnquiryBooked) {
      toast({ title: 'Navigation blocked', description: 'This enquiry is already booked. Please search for a different enquiry.', variant: 'destructive' });
      return;
    }

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
    if (isEnquiryBooked && tabIndex !== currentTab) {
      toast({ title: 'Navigation blocked', description: 'This enquiry is already booked. Please search for a different enquiry.', variant: 'destructive' });
      return;
    }

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
    if (field.isReadOnly) return false;
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

  const renderVehiclePricingPanel = () => {
    const vd = formData['vehicle_details'] || {};
    const editable = canEdit;
    const exShowroom = vd.ex_showroom_price ?? '';
    const cgstAmount = vd.cgst_amount ?? '';
    const sgstAmount = vd.sgst_amount ?? '';
    const vehicleTotal = vd.vehicle_total_price ?? calcVehicleTotalFromParts(vd);
    const cgstPerc = vd._cgstPerc ?? cgstMeta?.perc;
    const sgstPerc = vd._sgstPerc ?? sgstMeta?.perc;
    const cgstLabel = cgstPerc != null && cgstPerc !== '' ? `CGST (${cgstPerc}%)` : 'CGST';
    const sgstLabel = sgstPerc != null && sgstPerc !== '' ? `SGST (${sgstPerc}%)` : 'SGST';

    const computedTotal = calcVehicleTotalFromParts(vd);
    const displayTotal = vehicleTotal !== '' && vehicleTotal != null ? vehicleTotal : computedTotal;

    return (
      <div
        key="vehicle-pricing-panel"
        className="col-span-full rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Stock Available</Label>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder="From pre-booking"
              value={vd.stock_available ?? ''}
              onChange={(e) => setFieldValue('stock_available', e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Life Time Tax</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Enter life time tax"
              value={vd.life_time_tax ?? ''}
              onChange={(e) => setFieldValue('life_time_tax', e.target.value)}
              disabled={!editable}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5 min-w-[140px] flex-1">
            <Label className="text-sm font-medium">Vehicle Price</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Before GST"
              value={exShowroom}
              onChange={(e) => setFieldValue('ex_showroom_price', e.target.value)}
              disabled={!editable}
            />
          </div>
          <span className="pb-2.5 text-lg font-medium text-muted-foreground shrink-0">+</span>
          <div className="space-y-1.5 min-w-[120px] flex-1">
            <Label className="text-sm font-medium">{cgstLabel}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="CGST"
              value={cgstAmount}
              onChange={(e) => setFieldValue('cgst_amount', e.target.value)}
              disabled={!editable}
            />
          </div>
          <span className="pb-2.5 text-lg font-medium text-muted-foreground shrink-0">+</span>
          <div className="space-y-1.5 min-w-[120px] flex-1">
            <Label className="text-sm font-medium">{sgstLabel}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="SGST"
              value={sgstAmount}
              onChange={(e) => setFieldValue('sgst_amount', e.target.value)}
              disabled={!editable}
            />
          </div>
          <span className="pb-2.5 text-lg font-medium text-muted-foreground shrink-0">=</span>
          <div className="space-y-1.5 min-w-[140px] flex-1">
            <Label className="text-sm font-semibold">Ex-Showroom Price</Label>
            <Input
              type="number"
              step="0.01"
              className="font-semibold"
              placeholder="Including GST"
              value={displayTotal}
              onChange={(e) => setFieldValue('vehicle_total_price', e.target.value)}
              disabled={!editable}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderField = (field: ScreenField) => {
    if (!isFieldVisible(field)) return null;
    // Legacy field removed from seed — hide if still present in cached screen config
    if (field.name === 'comments' && currentScreenCode === 'vehicle_details') return null;
    if (
      currentScreenCode === 'vehicle_details' &&
      VEHICLE_PRICING_PANEL_FIELDS.includes(field.name)
    ) {
      return null;
    }

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

    // Legacy field removed from Screen 4 config
    if (field.name === 'ew_discount' && currentScreenCode === 'amounts_tax') {
      return null;
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

    // Chassis No — always render as dropdown on vehicle_details, regardless of stored fieldType
    if (field.name === 'chassis_no' && currentScreenCode === 'vehicle_details') {
      const frameOptions = chassisOptions.length > 0
        ? chassisOptions.map(f => ({ value: f.value, label: f.label }))
        : parseOptions(field.options);
      input = (
        <div className="relative">
          <Select
            value={value}
            onValueChange={(v: string) => {
              const selected = chassisOptions.find(f => f.value === v);
              setFormData((prev: Record<string, any>) => ({
                ...prev,
                vehicle_details: {
                  ...prev['vehicle_details'],
                  chassis_no: v,
                  ...(selected?.engineNo ? { engine_no: selected.engineNo } : {}),
                  ...(selected?.keyNo ? { key_no: selected.keyNo } : {}),
                  ...(selected?.batteryNo ? { battery_no: selected.batteryNo } : {}),
                },
              }));
            }}
            disabled={!editable || chassisLoading}
          >
            <SelectTrigger className={cn(error && 'border-destructive', chassisLoading && 'pr-10')}>
              <SelectValue placeholder={
                chassisLoading ? 'Loading frames...' :
                chassisOptions.length === 0 ? 'Select a variant to load frames' :
                'Select chassis / engine'
              } />
            </SelectTrigger>
            <SelectContent>
              {frameOptions.map((opt: { value: string; label: string }) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chassisLoading && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      );
    } else switch (field.fieldType) {
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
          let cascadingStringOptions: string[] = [];
          let isLoading = false;
          let isDisabled = !editable;
          const vehicleData = formData['vehicle_details'] || {};
          
          switch (field.name) {
            case 'brand':
              cascadingStringOptions = vehicleCatalogOptions.brands;
              isLoading = catalogLoading['brand'] || false;
              break;
            case 'model':
              cascadingStringOptions = vehicleCatalogOptions.models;
              isLoading = catalogLoading['model'] || catalogLoading['tvs'] || false;
              isDisabled = isDisabled || !vehicleData.brand ||
                (vehicleData.brand === 'TVS' && !vehicleData._tvsCatalogLoaded);
              break;
            case 'submodel':
              isLoading = catalogLoading['submodel'] || false;
              isDisabled = isDisabled || !vehicleData.brand || !vehicleData.model ||
                (vehicleData.brand === 'TVS' && !vehicleData._tvsCatalogLoaded);
              break;
            case 'variant':
              isLoading = catalogLoading['variant'] || false;
              isDisabled = isDisabled || !vehicleData.brand || !vehicleData.model ||
                (vehicleData.brand === 'TVS' && vehicleData._tvsCatalogLoaded && !vehicleData.submodel);
              break;
          }
          
          if (field.name === 'variant') {
            const variantOpts = vehicleCatalogOptions.variants;
            // Build composite key from saved modelId + variant name for matching
            const storedComposite = vehicleData._variantModelId
              ? `${vehicleData._variantModelId}|||${vehicleData._variantName || vehicleData.variant || ''}`
              : '';
            const selectValue = storedComposite || value || '';

            const finalVariantOptions = variantOpts.length > 0
              ? variantOpts.map(v => ({ value: v.value, label: v.label }))
              : options;

            const selectedVariant = variantOpts.find(v => v.value === selectValue) || variantOpts.find(v => v.label === value);
            const displayLabel = selectedVariant?.label || value || '';

            const selectedPartIds = selectedVariant?.partIds || [];
            const currentPartId = vehicleData._variantPartId || '';

            input = (
              <div className="space-y-2">
                <div className="relative">
                  <Select
                    value={selectValue}
                    onValueChange={(v) => {
                      const chosen = variantOpts.find(opt => opt.value === v);
                      const partIds = chosen?.partIds || [];
                      const partId = partIds.length === 1 ? partIds[0] : '';
                      setFormData(prev => ({
                        ...prev,
                        vehicle_details: {
                          ...prev['vehicle_details'],
                          variant: chosen?.label || v,
                          _variantModelId: chosen?.modelId || '',
                          _variantName: chosen?.originalVariant || '',
                          _variantPartId: partId,
                          chassis_no: '',
                          engine_no: '',
                        },
                      }));
                      if (partId) {
                        loadFramesForPart(partId);
                      } else {
                        setChassisOptions([]);
                      }
                    }}
                    disabled={isDisabled || isLoading}
                  >
                    <SelectTrigger className={cn(error && 'border-destructive', isLoading && 'pr-10')}>
                      <SelectValue placeholder={
                        isLoading ? 'Loading...' :
                        isDisabled && !editable ? 'Select...' :
                        isDisabled ? `Select ${VEHICLE_FIELD_DEPENDENCIES[field.name]?.slice(-1)[0] || ''} first` :
                        field.placeholder || 'Select...'
                      }>
                        {displayLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {finalVariantOptions.map((opt) => (
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
                {/* Part ID — hidden by default, toggle like Model ID */}
                {selectedPartIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Part ID</Label>
                    <button
                      type="button"
                      onClick={() => setShowPartId(!showPartId)}
                      className="p-1 rounded hover:bg-secondary transition-colors"
                      title={showPartId ? 'Hide Part ID' : 'Show Part ID'}
                    >
                      {showPartId ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {showPartId && (
                      selectedPartIds.length === 1 ? (
                        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{selectedPartIds[0]}</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {selectedPartIds.map((pid: string) => (
                            <button
                              key={pid}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  vehicle_details: {
                                    ...prev['vehicle_details'],
                                    _variantPartId: pid,
                                    chassis_no: '',
                                    engine_no: '',
                                  },
                                }));
                                loadFramesForPart(pid);
                              }}
                              className={cn(
                                'text-xs font-mono px-2 py-0.5 rounded border transition-colors',
                                currentPartId === pid
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted hover:bg-accent border-transparent'
                              )}
                            >
                              {pid}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          } else if (field.name === 'submodel') {
            const submodelOpts = vehicleCatalogOptions.submodels;
            const submodelDisplay =
              submodelOpts.find((s) => s.value === value)?.label ||
              vehicleData._submodelLabel ||
              value ||
              '';
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
                      isDisabled ? 'Select model first' :
                      field.placeholder || 'Select sub-model...'
                    }>
                      {submodelDisplay}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {submodelOpts.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isLoading && (
                  <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!isLoading && submodelOpts.length === 0 && vehicleData.model && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {vehicleData._tvsCatalogLoaded
                      ? 'No sub-models returned for this model group.'
                      : 'Click Refresh Model beside Brand to load the TVS catalog first.'}
                  </p>
                )}
              </div>
            );
          } else {
            // Brand and model — simple string options
            const finalOptions = cascadingStringOptions.length > 0 
              ? cascadingStringOptions.map(opt => ({ value: opt, label: opt }))
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
          }
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
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        const minDate = twoMonthsAgo.toISOString().split('T')[0];
        input = (
          <Input
            type="date"
            value={value}
            onChange={(e) => setFieldValue(field.name, e.target.value)}
            min={field.name === 'booking_date' ? minDate : undefined}
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

    const isBookedStatusField = field.name === 'enquiry_status' && isEnquiryBooked;

    return (
      <div key={field.id} className={cn(
        "space-y-2",
        isBookedStatusField && "rounded-lg border-2 border-red-500 bg-red-50 p-3"
      )}>
        <Label className={cn("flex items-center gap-1 flex-wrap", isBookedStatusField && "text-red-700 font-semibold")}>
          {field.label}
          {field.isRequired && <span className="text-destructive">*</span>}
          {currentScreenCode === 'vehicle_details' && field.name === 'brand' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-1 h-7 px-2 text-xs"
              onClick={handleSelectTvs}
              disabled={!editable || !!catalogLoading['tvs']}
            >
              {catalogLoading['tvs'] ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Refresh Model
            </Button>
          )}
          {isBookedStatusField && <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">BLOCKED</span>}
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

  const displayEnquiryId =
    fetchedEnquiryNo ||
    formData['customer_enquiry']?.enquiry_no ||
    submission?.formData?.customer_enquiry?.enquiry_no ||
    '';
  const displayPhone =
    formData['customer_enquiry']?.mobile_no ||
    submission?.formData?.customer_enquiry?.mobile_no ||
    '';

  const vehicleDetailsData = formData['vehicle_details'] || {};
  const stockAvailableCount = parseInt(String(vehicleDetailsData.stock_available ?? ''), 10);
  const hasStockForBooking = Number.isFinite(stockAvailableCount) && stockAvailableCount >= 1;

  return (
    <div className="page-enter space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <div className="shrink-0 min-w-[10rem]">
          <h1 className="text-2xl font-bold leading-tight">{flow.name}</h1>
          <p className="text-sm text-muted-foreground">{flow.description}</p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-2 min-w-[12rem] px-1">
          <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">Enquiry ID</span>
            <span className="font-mono font-semibold">{displayEnquiryId || '—'}</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-mono font-medium">{displayPhone || '—'}</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
            <Key className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-medium text-amber-800">OTP</span>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={otpValue}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                setOtpValue(value);
              }}
              className="w-14 h-7 text-center font-mono text-xs px-1 bg-white"
            />
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleOtpUpdate}
              disabled={isUpdatingOtp || !otpValue || otpValue.length !== 4}
            >
              {isUpdatingOtp ? '...' : 'Save'}
            </Button>
          </div>
        </div>

        {submission && (
          <Badge className={cn(
            'shrink-0 ml-auto',
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

          const blockedByBooking = isEnquiryBooked && !isCurrent;

          return (
            <button
              key={fs.id}
              onClick={() => handleTabClick(index)}
              disabled={!accessible || blockedByBooking}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap',
                isCurrent && !isEnquiryBooked && 'bg-primary text-primary-foreground border-primary',
                isCurrent && isEnquiryBooked && 'bg-red-600 text-white border-red-600',
                !isCurrent && !blockedByBooking && accessible && 'hover:bg-secondary',
                blockedByBooking && 'opacity-40 cursor-not-allowed border-red-300 bg-red-50',
                !accessible && !blockedByBooking && 'opacity-50 cursor-not-allowed',
                isPostApproval && !isCurrent && !isFullyApproved && !blockedByBooking && 'border-blue-400 bg-blue-50',
                isPostApproval && !isCurrent && isFullyApproved && !blockedByBooking && 'border-green-400 bg-green-50'
              )}
              title={blockedByBooking
                ? 'Enquiry already booked — navigation blocked'
                : isPostApproval ? (
                  isFullyApproved 
                    ? 'Ready to print' 
                    : 'Preview only - Print available after full approval'
                ) : undefined}
            >
              {blockedByBooking && (
                <Lock className="h-3.5 w-3.5 text-red-400" />
              )}
              {saved && !isCurrent && !isPostApproval && !blockedByBooking && (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {isPostApproval && !blockedByBooking && (
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
            {/* Self Managed checkbox - on insurance_nominee_demographics screen */}
            {currentScreenCode === 'insurance_nominee_demographics' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="self-managed-insurance"
                  checked={selfManagedInsurance}
                  onCheckedChange={(checked: boolean) => {
                    setSelfManagedInsurance(!!checked);
                    // Persist in form data so it survives save/reload
                    setFormData(prev => ({
                      ...prev,
                      insurance_nominee_demographics: {
                        ...prev['insurance_nominee_demographics'],
                        _selfManaged: !!checked,
                      },
                    }));
                  }}
                />
                <Label htmlFor="self-managed-insurance" className="text-sm font-medium cursor-pointer select-none">
                  Self Managed
                </Label>
              </div>
            )}
            {/* Generate Invoice button - on invoice screen */}
            {currentScreenCode === 'invoice' && (
              <Button
                variant="outline"
                className="gap-2 border-orange-400 text-orange-700 hover:bg-orange-50"
                onClick={() => {
                  toast({ title: 'Invoice not generated', description: 'Invoice generation API is not linked yet.', variant: 'destructive' });
                }}
              >
                <Play className="h-4 w-4" />
                Generate Invoice
              </Button>
            )}
            {/* Fetch Pre Booking, Pre Fetch & Perform Booking - on vehicle_details screen */}
            {currentScreenCode === 'vehicle_details' && fetchedEnquiryNo && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleFetchPreBooking}
                  disabled={preBookingLoading}
                  className={cn(
                    "gap-2",
                    preBookingDone
                      ? "border-green-300 text-green-700 hover:bg-green-50"
                      : "border-purple-300 text-purple-700 hover:bg-purple-50"
                  )}
                >
                  {preBookingLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Fetching Pre-Booking...
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

        {/* Red banner when enquiry is already booked */}
        {isEnquiryBooked && currentTab === 0 && (
          <div className="mx-6 mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">This enquiry is already booked</p>
              <p className="text-sm text-red-600">Navigation to other tabs is blocked. Please search for a different enquiry to continue.</p>
            </div>
          </div>
        )}

        <CardContent className="space-y-4 print:space-y-2">
          {/* Self Managed overlay — blocks all insurance fields */}
          {currentScreenCode === 'insurance_nominee_demographics' && selfManagedInsurance && (
            <div className="relative rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/80 p-8 flex flex-col items-center justify-center gap-3">
              <Lock className="h-8 w-8 text-amber-500" />
              <p className="text-amber-700 font-semibold text-lg">Self Managed</p>
              <p className="text-amber-600 text-sm text-center max-w-md">
                Insurance, nominee, and demographics details are self-managed by the customer.
                No data entry is required. Click Next to continue.
              </p>
            </div>
          )}
          {currentScreenCode === 'insurance_nominee_demographics' && selfManagedInsurance ? null : currentScreenCode === 'vehicle_details' ? (
            <>
              {/* Pre-booking fields (brand, model, variant, fuel_type, etc.) */}
              {currentFields
                .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
                .filter((field: ScreenField) => !POST_BOOKING_FIELDS.includes(field.name))
                .filter((field: ScreenField) => !VEHICLE_PRICING_PANEL_FIELDS.includes(field.name))
                .filter((field: ScreenField) => !FRAME_SELECTION_FIELDS.includes(field.name))
                .filter((field: ScreenField) => field.name !== 'comments')
                .map((field: ScreenField) => renderField(field))}

              {renderVehiclePricingPanel()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
                {currentFields
                  .filter((field: ScreenField) => FRAME_SELECTION_FIELDS.includes(field.name))
                  .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
                  .map((field: ScreenField) => renderField(field))}
              </div>

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

              <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50/50">
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => handlePerformBookingViaAutomation()}
                    disabled={bookingSectionUnlocked || performBookingLoading}
                    className={cn(
                      'gap-2',
                      bookingSectionUnlocked
                        ? 'bg-green-600 hover:bg-green-600 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    {performBookingLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : bookingSectionUnlocked ? (
                      <>
                        <Unlock className="h-4 w-4" />
                        Booking Done
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Perform Booking without Stock
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handlePerformBookingViaAutomation({ requireStock: true })}
                    disabled={bookingSectionUnlocked || performBookingLoading || !hasStockForBooking}
                    title={
                      !hasStockForBooking
                        ? 'Stock must be 1 or more (load frames after selecting Variant)'
                        : undefined
                    }
                    className={cn(
                      'gap-2',
                      bookingSectionUnlocked
                        ? 'bg-green-600 hover:bg-green-600 cursor-default'
                        : hasStockForBooking
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : ''
                    )}
                  >
                    {performBookingLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : bookingSectionUnlocked ? (
                      <>
                        <Unlock className="h-4 w-4" />
                        Booking Done
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Perform Booking with Chasis
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Post-booking fields — overlay temporarily disabled for testing */}
              <div className="relative">
                {/* TODO: Re-enable overlay after testing
                {!bookingSectionUnlocked && (
                  <div className="absolute inset-0 z-10 bg-gray-100/70 backdrop-blur-[1px] rounded-lg flex items-center justify-center cursor-not-allowed">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border text-sm text-gray-500">
                      <Lock className="h-4 w-4" />
                      Enter booking amount and click &quot;Perform Booking&quot; to unlock
                    </div>
                  </div>
                )}
                */}
                <div className={cn("space-y-4")}>
                  {/* Fetch Chassis button — loads FRAME_NO dropdown from TVS */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-blue-50/50">
                    <Button
                      onClick={handleFetchChassis}
                      disabled={chassisLoading || !fetchedEnquiryNo}
                      variant="outline"
                      className={cn(
                        "gap-2",
                        chassisOptions.length > 0
                          ? "border-green-500 text-green-700 hover:bg-green-50"
                          : "border-blue-500 text-blue-700 hover:bg-blue-50"
                      )}
                    >
                      {chassisLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : chassisOptions.length > 0 ? (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Refresh Chassis ({chassisOptions.length})
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Fetch Chassis
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {chassisOptions.length > 0
                        ? `${chassisOptions.length} frame(s) loaded — refresh or re-select variant to reload`
                        : 'Refresh frames after variant selection (also loads automatically)'}
                    </span>
                  </div>

                  {currentFields
                    .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
                    .filter((field: ScreenField) => POST_BOOKING_FIELDS.includes(field.name))
                    .map((field: ScreenField) => renderField(field))}

                  {/* Perform Allotment button — below RTO State */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-purple-50/50 mt-2">
                    <Button
                      onClick={handlePerformAllotmentViaAutomation}
                      disabled={allotmentLoading || !(formData['vehicle_details']?.chassis_no) || chassisOptions.length === 0}
                      variant="outline"
                      className="gap-2 border-purple-500 text-purple-700 hover:bg-purple-50"
                    >
                      {allotmentLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Perform Allotment
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {formData['vehicle_details']?.chassis_no
                        ? `Allot vehicle with chassis: ${formData['vehicle_details'].chassis_no}`
                        : 'Select a chassis number first to perform allotment'}
                    </span>
                  </div>

                  {/* Save Booking button — hidden for now
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-green-50/50 mt-2">
                    <Button
                      onClick={handleSaveBookingAfterAllotment}
                      disabled={saveBookingAfterAllotLoading || !fetchedEnquiryNo}
                      variant="outline"
                      className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
                    >
                      {saveBookingAfterAllotLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Save Booking
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Save booking with allotment details
                    </span>
                  </div>
                  */}
                </div>
              </div>
            </>
          ) : (
            currentFields
              .sort((a: ScreenField, b: ScreenField) => a.sortOrder - b.sortOrder)
              .filter(
                (field: ScreenField) =>
                  currentScreenCode !== 'amounts_tax' ||
                  !AMOUNTS_TAX_HIDDEN_FIELDS.includes(field.name)
              )
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
            <Button onClick={handleNext} disabled={saveMutation.isPending || isEnquiryBooked}>
              {isEnquiryBooked ? (
                <>
                  <Lock className="h-4 w-4 mr-1" />
                  Blocked
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
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

      {/* Booking Confirmation Modal */}
      <Dialog open={showBookingConfirm} onOpenChange={(open) => { if (!performBookingLoading) setShowBookingConfirm(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Booking Details</DialogTitle>
            <DialogDescription>
              Enquiry #{fetchedEnquiryNo} &mdash; Review and confirm the vehicle and pricing details below.
            </DialogDescription>
          </DialogHeader>

          {bookingConfirmData && (
            <div className="space-y-4 py-2">
              {/* Vehicle Info (read-only) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Brand</Label>
                  <Input value={bookingConfirmData.brand} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  <Input value={bookingConfirmData.model} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Variant</Label>
                  <Input value={bookingConfirmData.variant} disabled className="mt-1" />
                </div>
              </div>

              <hr />

              {/* Editable pricing fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input type="number" min={1} value={bookingConfirmData.quantity} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, quantity: Number(e.target.value) || 1 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Unit Price</Label>
                  <Input type="number" min={0} value={bookingConfirmData.unitPrice} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, unitPrice: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Ex-Showroom Price</Label>
                  <Input type="number" min={0} value={bookingConfirmData.exShowroomPrice} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, exShowroomPrice: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Accessory Charges</Label>
                  <Input type="number" min={0} value={bookingConfirmData.accCharges} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, accCharges: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Discount</Label>
                  <Input type="number" min={0} value={bookingConfirmData.discount} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, discount: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Manual Discount</Label>
                  <Input type="number" min={0} value={bookingConfirmData.manualDiscount} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, manualDiscount: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Registration Charges</Label>
                  <Input type="number" min={0} value={bookingConfirmData.regCharges} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, regCharges: Number(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <Label className="text-xs">Insurance Charges</Label>
                  <Input type="number" min={0} value={bookingConfirmData.insCharges} className="mt-1"
                    onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, insCharges: Number(e.target.value) || 0 } : prev)} />
                </div>
              </div>

              <hr />

              {/* Booking Amount */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Booking Amount</Label>
                <Input type="number" min={0} className="w-40 text-right font-semibold"
                  value={bookingConfirmData.bookingAmt}
                  onChange={(e: any) => setBookingConfirmData(prev => prev ? { ...prev, bookingAmt: Number(e.target.value) || 0 } : prev)} />
              </div>

              {/* Computed total (informational) */}
              <div className="flex items-center justify-between text-sm bg-gray-50 p-3 rounded-lg">
                <span className="text-muted-foreground">Estimated Total</span>
                <span className="font-bold text-base">
                  ₹{(
                    (bookingConfirmData.unitPrice * bookingConfirmData.quantity)
                    + bookingConfirmData.accCharges
                    + bookingConfirmData.regCharges
                    + bookingConfirmData.insCharges
                    - bookingConfirmData.discount
                    - bookingConfirmData.manualDiscount
                  ).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Warning when prices are missing */}
              {bookingConfirmData.unitPrice === 0 && bookingConfirmData.exShowroomPrice === 0 && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                  Unit Price and Ex-Showroom Price are both 0. Please enter valid prices before confirming.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowBookingConfirm(false)} disabled={performBookingLoading}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 gap-2"
              onClick={handleConfirmBooking}
              disabled={performBookingLoading || (bookingConfirmData?.unitPrice === 0 && bookingConfirmData?.exShowroomPrice === 0)}
            >
              {performBookingLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Confirm Booking
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

