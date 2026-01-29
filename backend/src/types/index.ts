import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  id: string;
  username: string;
  type: 'superadmin' | 'user';
  role?: UserRole;
  branchId?: string;
  organizationId?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateOrganizationDto {
  name: string;
  code: string;
  description?: string;
  logo?: string;
  legalName?: string;
  ownerName?: string;
  address?: string;
  gstNumber?: string;
  panNumber?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  description?: string;
  logo?: string;
  legalName?: string;
  ownerName?: string;
  address?: string;
  gstNumber?: string;
  panNumber?: string;
  isActive?: boolean;
}

export type BranchType = 'TVS' | 'HONDA';

export interface CreateBranchDto {
  name: string;
  code: string;
  description?: string;
  address?: string;
  invoiceAddress?: string;
  organizationId: string;
  branchType?: BranchType;
  externalBranchId?: number;
  countryCode?: string;
  dealerId?: number;
  managerValidUntil?: string;
  associateValidUntil?: string;
  viewerValidUntil?: string;
  insuranceExecutiveValidUntil?: string;
  requiresApproval?: boolean;
  allowAssociateJobs?: boolean;
}

export interface UpdateBranchDto {
  name?: string;
  description?: string;
  address?: string;
  invoiceAddress?: string;
  isActive?: boolean;
  branchType?: BranchType;
  externalBranchId?: number;
  countryCode?: string;
  dealerId?: number;
  managerValidUntil?: string;
  associateValidUntil?: string;
  viewerValidUntil?: string;
  insuranceExecutiveValidUntil?: string;
  requiresApproval?: boolean;
  allowAssociateJobs?: boolean;
}

export interface CreateUserDto {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  branchId: string;
  externalUserId?: number;
  externalLoginId?: string;
  externalRoleId?: number;
  validUntil?: string;
}

export interface UpdateUserDto {
  password?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
  externalUserId?: number;
  externalLoginId?: string;
  externalRoleId?: number;
  validUntil?: string;
}

export interface CreateScreenDto {
  name: string;
  code: string;
  description?: string;
  requiresApproval?: boolean;
  requiresInsuranceApproval?: boolean;
  isPostApproval?: boolean;
}

export interface UpdateScreenDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  requiresApproval?: boolean;
  requiresInsuranceApproval?: boolean;
  isPostApproval?: boolean;
}

export interface CreateScreenFieldDto {
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
  conditionalField?: string;
  conditionalValue?: string;
  sortOrder?: number;
  visibleToManager?: boolean;
  visibleToAssociate?: boolean;
  visibleToViewer?: boolean;
  editableByManager?: boolean;
  editableByAssociate?: boolean;
  editableByViewer?: boolean;
}

export interface UpdateScreenFieldDto extends Partial<Omit<CreateScreenFieldDto, 'screenId'>> {}

export interface CreateFlowDto {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateFlowDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface AddFlowScreenDto {
  flowId: string;
  screenId: string;
  tabOrder: number;
  tabName: string;
}

export interface CreateFlowAssignmentDto {
  flowId: string;
  branchId: string;
  accessibleByManager?: boolean;
  accessibleByAssociate?: boolean;
  accessibleByViewer?: boolean;
}

export interface SaveFormDataDto {
  flowId: string;
  tabIndex: number;
  data: Record<string, any>;
}

export interface SubmitFormDto {
  submissionId: string;
}

export interface ApprovalActionDto {
  submissionId: string;
  action: 'approve' | 'reject';
  comments?: string;
}

