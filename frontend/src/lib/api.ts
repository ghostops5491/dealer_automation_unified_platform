import axios from 'axios';
import { useAuthStore } from '@/store/auth';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect on 401 for login endpoints - let the login page handle the error
    const isLoginEndpoint = error.config?.url?.includes('/auth/') && 
                            error.config?.url?.includes('/login');
    
    if (error.response?.status === 401 && !isLoginEndpoint) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  loginSuperAdmin: (username: string, password: string) =>
    api.post('/auth/superadmin/login', { username, password }),
  loginUser: (username: string, password: string) =>
    api.post('/auth/user/login', { username, password }),
  getMe: () => api.get('/auth/me'),
};

// Organizations
export const organizationApi = {
  getAll: () => api.get('/organizations'),
  getById: (id: string) => api.get(`/organizations/${id}`),
  create: (data: { 
    name: string; 
    code: string; 
    description?: string;
    logo?: string;
    legalName?: string;
    ownerName?: string;
    address?: string;
    gstNumber?: string;
    panNumber?: string;
  }) => api.post('/organizations', data),
  update: (id: string, data: { 
    name?: string; 
    description?: string | null; 
    isActive?: boolean; 
    logo?: string | null;
    legalName?: string | null;
    ownerName?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    panNumber?: string | null;
  }) => api.put(`/organizations/${id}`, data),
  delete: (id: string) => api.delete(`/organizations/${id}`),
  addField: (id: string, data: { fieldName: string; fieldValue: string }) =>
    api.post(`/organizations/${id}/fields`, data),
  deleteField: (id: string, fieldId: string) =>
    api.delete(`/organizations/${id}/fields/${fieldId}`),
};

// Branches
export const branchApi = {
  getAll: (organizationId?: string) =>
    api.get('/branches', { params: { organizationId } }),
  getById: (id: string) => api.get(`/branches/${id}`),
  create: (data: {
    name: string;
    code: string;
    description?: string;
    address?: string;
    invoiceAddress?: string;
    organizationId: string;
    branchType?: 'TVS' | 'HONDA';
    externalBranchId?: number;
    countryCode?: string;
    dealerId?: number;
    managerValidUntil?: string;
    associateValidUntil?: string;
    viewerValidUntil?: string;
    requiresApproval?: boolean;
    allowAssociateJobs?: boolean;
  }) => api.post('/branches', data),
  update: (id: string, data: {
    name?: string;
    description?: string;
    address?: string;
    invoiceAddress?: string;
    isActive?: boolean;
    branchType?: 'TVS' | 'HONDA';
    externalBranchId?: number;
    countryCode?: string;
    dealerId?: number;
    managerValidUntil?: string;
    associateValidUntil?: string;
    viewerValidUntil?: string;
    requiresApproval?: boolean;
    allowAssociateJobs?: boolean;
  }) => api.put(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
  updateTimeline: (id: string, data: { role: string; validUntil: string | null }) =>
    api.put(`/branches/${id}/timeline`, data),
  addField: (id: string, data: { fieldName: string; fieldValue: string }) =>
    api.post(`/branches/${id}/fields`, data),
  deleteField: (id: string, fieldId: string) =>
    api.delete(`/branches/${id}/fields/${fieldId}`),
};

// Users
export const userApi = {
  getAll: (params?: { branchId?: string; organizationId?: string; role?: string }) =>
    api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    role: string;
    branchId: string;
    externalUserId?: number;
    externalLoginId?: string;
    externalRoleId?: number;
    validUntil?: string;
  }) => api.post('/users', data),
  update: (id: string, data: {
    password?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    role?: string;
    isActive?: boolean;
    externalUserId?: number;
    externalLoginId?: string;
    externalRoleId?: number;
    validUntil?: string;
  }) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  extendValidity: (id: string, validUntil: string | null) =>
    api.put(`/users/${id}/validity`, { validUntil }),
  resetPassword: (id: string, newPassword: string) =>
    api.put(`/users/${id}/password`, { newPassword }),
  addField: (id: string, data: { fieldName: string; fieldValue: string }) =>
    api.post(`/users/${id}/fields`, data),
  deleteField: (id: string, fieldId: string) =>
    api.delete(`/users/${id}/fields/${fieldId}`),
};

// Screens
export const screenApi = {
  getAll: () => api.get('/screens'),
  getById: (id: string) => api.get(`/screens/${id}`),
  create: (data: { 
    name: string; 
    code: string; 
    description?: string; 
    requiresApproval?: boolean;
    requiresInsuranceApproval?: boolean;
    isPostApproval?: boolean;
  }) => api.post('/screens', data),
  update: (id: string, data: { 
    name?: string; 
    description?: string; 
    isActive?: boolean;
    requiresApproval?: boolean;
    requiresInsuranceApproval?: boolean;
    isPostApproval?: boolean;
  }) => api.put(`/screens/${id}`, data),
  delete: (id: string) => api.delete(`/screens/${id}`),
  addField: (data: {
    screenId: string;
    name: string;
    label: string;
    fieldType: string;
    placeholder?: string;
    defaultValue?: string;
    isRequired?: boolean;
    validationRegex?: string;
    validationMessage?: string;
    minLength?: number;
    maxLength?: number;
    minValue?: number;
    maxValue?: number;
    options?: { value: string; label: string }[];
    sortOrder?: number;
    visibleToManager?: boolean;
    visibleToAssociate?: boolean;
    visibleToViewer?: boolean;
    editableByManager?: boolean;
    editableByAssociate?: boolean;
    editableByViewer?: boolean;
  }) => api.post('/screens/fields', data),
  updateField: (fieldId: string, data: Record<string, unknown>) =>
    api.put(`/screens/fields/${fieldId}`, data),
  deleteField: (fieldId: string) => api.delete(`/screens/fields/${fieldId}`),
  reorderFields: (screenId: string, fieldOrders: { fieldId: string; sortOrder: number }[]) =>
    api.put(`/screens/${screenId}/reorder`, { fieldOrders }),
};

// Flows
export const flowApi = {
  getAll: () => api.get('/flows'),
  getById: (id: string) => api.get(`/flows/${id}`),
  getForUser: (id: string) => api.get(`/flows/view/${id}`),
  getMyFlows: () => api.get('/flows/my-flows'),
  create: (data: { name: string; code: string; description?: string }) =>
    api.post('/flows', data),
  update: (id: string, data: { name?: string; description?: string; isActive?: boolean }) =>
    api.put(`/flows/${id}`, data),
  delete: (id: string) => api.delete(`/flows/${id}`),
  addScreen: (data: { flowId: string; screenId: string; tabOrder: number; tabName: string }) =>
    api.post('/flows/screens', data),
  updateScreen: (flowScreenId: string, data: { tabName?: string; tabOrder?: number }) =>
    api.put(`/flows/screens/${flowScreenId}`, data),
  removeScreen: (flowScreenId: string) => api.delete(`/flows/screens/${flowScreenId}`),
  reorderScreens: (flowId: string, screenOrders: { flowScreenId: string; tabOrder: number }[]) =>
    api.put(`/flows/${flowId}/reorder-screens`, { screenOrders }),
  assignToBranch: (data: {
    flowId: string;
    branchId: string;
    accessibleByManager?: boolean;
    accessibleByAssociate?: boolean;
    accessibleByViewer?: boolean;
  }) => api.post('/flows/assignments', data),
  unassignFromBranch: (assignmentId: string) =>
    api.delete(`/flows/assignments/${assignmentId}`),
};

// Forms
export const formApi = {
  getAll: (params?: { status?: string; flowId?: string; branchId?: string; userId?: string }) =>
    api.get('/forms', { params }),
  getById: (id: string) => api.get(`/forms/${id}`),
  getMySubmissions: (status?: string) =>
    api.get('/forms/my-submissions', { params: { status } }),
  getPendingApprovals: () => api.get('/forms/pending-approvals'),
  getPendingInsuranceApprovals: () => api.get('/forms/pending-insurance-approvals'),
  getStats: () => api.get('/forms/stats'),
  start: (flowId: string) => api.post('/forms/start', { flowId }),
  saveTab: (id: string, tabIndex: number, data: Record<string, unknown>) =>
    api.put(`/forms/${id}/tab`, { tabIndex, data }),
  submit: (id: string) => api.post(`/forms/${id}/submit`),
  approve: (id: string, comments?: string) =>
    api.post(`/forms/${id}/approve`, { action: 'approve', comments }),
  reject: (id: string, comments?: string) =>
    api.post(`/forms/${id}/approve`, { action: 'reject', comments }),
  insuranceApprove: (id: string, comments?: string) =>
    api.post(`/forms/${id}/insurance-approve`, { action: 'approve', comments }),
  insuranceReject: (id: string, comments?: string) =>
    api.post(`/forms/${id}/insurance-approve`, { action: 'reject', comments }),
  delete: (id: string) => api.delete(`/forms/${id}`),
};

// History & Analytics
export const historyApi = {
  getSubmissionHistory: (submissionId: string) => 
    api.get(`/history/submission/${submissionId}`),
  getBranchHistory: (params?: { page?: number; limit?: number; status?: string; flowId?: string }) =>
    api.get('/history/branch', { params }),
  getAnalytics: (period?: 'day' | 'week' | 'month' | 'quarter' | 'year') =>
    api.get('/history/analytics', { params: { period } }),
};

// File Upload
export const uploadApi = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/single', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadMultiple: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post('/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteFile: (filepath: string) => api.delete('/upload', { data: { filepath } }),
  getFileInfo: (filepath: string) => api.get(`/upload/info/${encodeURIComponent(filepath)}`),
};

// Jobs (Robot Framework Automation)
export const jobApi = {
  runAllEntries: () => api.post('/jobs/run-all'),
  runLastEntry: () => api.post('/jobs/run-last'),
  runBooking: (enquiryNo: string) => api.post('/jobs/run-booking', { enquiryNo }),
  runEnquiry: (enquiryNo: string) => api.post('/jobs/run-enquiry', { enquiryNo }),
  runInsurance: (enquiryNo: string, submissionId?: string) => 
    api.post('/jobs/run-insurance', { enquiryNo, submissionId }),
  getAllJobs: () => api.get('/jobs'),
  getJobStatus: (jobId: string) => api.get(`/jobs/${jobId}`),
  stopJob: (jobId: string) => api.post(`/jobs/${jobId}/stop`),
};

// External API Integration (TVS/Honda)
export const externalApi = {
  checkConfig: () => api.get('/external/config'),
  generateToken: () => api.post('/external/generate-token'),
  clearTokenCache: () => api.post('/external/clear-token'),
  fetchEnquiry: (data: { enquiryNumber?: string; mobileNumber?: string; authToken?: string }) =>
    api.post('/external/fetch-enquiry', data),
  fetchEnquiryById: (data: { enquiryId: string; authToken?: string }) =>
    api.post('/external/fetch-enquiry-by-id', data),
};

// Vehicle Catalog (Cascading Dropdowns)
export const vehicleCatalogApi = {
  // Get summary (counts)
  getSummary: () => api.get('/vehicle-catalog/summary'),
  
  // Get full catalog (manager only)
  getAll: () => api.get('/vehicle-catalog'),
  
  // Upload CSV (manager only)
  uploadCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/vehicle-catalog/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  // Delete all catalog entries (manager only)
  deleteAll: () => api.delete('/vehicle-catalog'),
  
  // Download CSV template
  downloadTemplate: () => api.get('/vehicle-catalog/template', { responseType: 'blob' }),
  
  // Cascading dropdown APIs
  getBrands: () => api.get('/vehicle-catalog/brands'),
  getModels: (brand: string) => api.get('/vehicle-catalog/models', { params: { brand } }),
  getVariants: (brand: string, model: string) => 
    api.get('/vehicle-catalog/variants', { params: { brand, model } }),
  getColours: (brand: string, model: string, variant: string) => 
    api.get('/vehicle-catalog/colours', { params: { brand, model, variant } }),
  getFuelTypes: (brand: string, model: string, variant: string, colour: string) => 
    api.get('/vehicle-catalog/fuel-types', { params: { brand, model, variant, colour } }),
};

// OTP Configuration (for form_filling automation)
export const otpConfigApi = {
  getOtp: () => api.get('/otp-config'),
  updateOtp: (otp: string) => api.put('/otp-config', { otp }),
};
