export type UserRole = 'MANAGER' | 'ASSOCIATE' | 'VIEWER' | 'INSURANCE_EXECUTIVE';
export type UserType = 'superadmin' | 'user';
export type SubmissionStatus = 'DRAFT' | 'PENDING_INSURANCE_APPROVAL' | 'PENDING_MANAGER_APPROVAL' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type FieldType = 
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTISELECT'
  | 'CHECKBOX'
  | 'RADIO'
  | 'FILE'
  | 'IMAGE';

export interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  type: UserType;
  validUntil?: string;
  isActive?: boolean;
  branchId?: string;
  branch?: Branch;
  organization?: Organization;
  fields?: CustomField[];
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  description?: string;
  logo?: string | null;
  legalName?: string | null;
  ownerName?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branches?: Branch[];
  fields?: CustomField[];
  _count?: {
    branches: number;
  };
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  description?: string;
  address?: string | null;
  invoiceAddress?: string | null;
  isActive: boolean;
  organizationId: string;
  organization?: Organization;
  managerValidUntil?: string;
  associateValidUntil?: string;
  viewerValidUntil?: string;
  insuranceExecutiveValidUntil?: string;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  users?: User[];
  fields?: CustomField[];
  flowAssignments?: FlowAssignment[];
  _count?: {
    users: number;
    formSubmissions: number;
  };
}

export interface CustomField {
  id: string;
  fieldName: string;
  fieldValue: string;
}

export interface Screen {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  requiresApproval: boolean;
  requiresInsuranceApproval: boolean;
  isPostApproval: boolean;
  createdAt: string;
  updatedAt: string;
  fields?: ScreenField[];
  _count?: {
    flowScreens: number;
  };
}

export interface ScreenField {
  id: string;
  screenId: string;
  name: string;
  label: string;
  fieldType: FieldType;
  placeholder?: string;
  defaultValue?: string;
  isRequired: boolean;
  validationRegex?: string;
  validationMessage?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  options?: string; // JSON string of options
  conditionalField?: string; // Field to check for conditional visibility
  conditionalValue?: string; // Value(s) that make this field visible
  sortOrder: number;
  visibleToManager: boolean;
  visibleToAssociate: boolean;
  visibleToViewer: boolean;
  editableByManager: boolean;
  editableByAssociate: boolean;
  editableByViewer: boolean;
}

export interface Flow {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  flowScreens?: FlowScreen[];
  flowAssignments?: FlowAssignment[];
  _count?: {
    formSubmissions: number;
  };
}

export interface FlowScreen {
  id: string;
  flowId: string;
  screenId: string;
  tabOrder: number;
  tabName: string;
  screen?: Screen;
  flow?: Flow;
}

export interface FlowAssignment {
  id: string;
  flowId: string;
  branchId: string;
  accessibleByManager: boolean;
  accessibleByAssociate: boolean;
  accessibleByViewer: boolean;
  flow?: Flow;
  branch?: Branch;
}

export interface FormSubmission {
  id: string;
  flowId: string;
  branchId: string;
  userId: string;
  status: SubmissionStatus;
  currentTabIndex: number;
  formData: Record<string, Record<string, unknown>>;
  insuranceApprovalStatus?: string | null;
  insuranceApprovedById?: string | null;
  insuranceApprovedAt?: string | null;
  insuranceComments?: string | null;
  insuranceApprovedBy?: User | null;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  flow?: Flow;
  branch?: Branch;
  user?: User;
  approvals?: Approval[];
}

export interface Approval {
  id: string;
  submissionId: string;
  managerId: string;
  status: SubmissionStatus;
  comments?: string;
  createdAt: string;
  manager?: User;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

