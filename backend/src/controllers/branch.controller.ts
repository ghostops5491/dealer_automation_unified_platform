import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, CreateBranchDto, UpdateBranchDto } from '../types';

export const getAllBranches = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { organizationId } = req.query;

    const branches = await prisma.branch.findMany({
      where: organizationId ? { organizationId: organizationId as string } : undefined,
      include: {
        organization: true,
        users: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
        fields: true,
        flowAssignments: {
          include: {
            flow: true,
          },
        },
        _count: {
          select: { users: true, formSubmissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: branches,
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getBranchById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        organization: true,
        users: {
          include: {
            fields: true,
          },
        },
        fields: true,
        flowAssignments: {
          include: {
            flow: {
              include: {
                flowScreens: {
                  include: {
                    screen: true,
                  },
                  orderBy: { tabOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!branch) {
      res.status(404).json({
        success: false,
        error: 'Branch not found',
      });
      return;
    }

    res.json({
      success: true,
      data: branch,
    });
  } catch (error) {
    console.error('Get branch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const createBranch = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const {
      name,
      code,
      description,
      address,
      invoiceAddress,
      organizationId,
      branchType,
      externalBranchId,
      countryCode,
      dealerId,
      managerValidUntil,
      associateValidUntil,
      viewerValidUntil,
      insuranceExecutiveValidUntil,
      requiresApproval,
      allowAssociateJobs,
    } = req.body as CreateBranchDto;

    // Check if code already exists
    const existing = await prisma.branch.findUnique({
      where: { code },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Branch code already exists',
      });
      return;
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      res.status(400).json({
        success: false,
        error: 'Organization not found',
      });
      return;
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
        address,
        invoiceAddress,
        organizationId,
        branchType: branchType || 'TVS',
        externalBranchId: externalBranchId || null,
        countryCode: countryCode || 'IN',
        dealerId: dealerId || null,
        managerValidUntil: managerValidUntil ? new Date(managerValidUntil) : null,
        associateValidUntil: associateValidUntil ? new Date(associateValidUntil) : null,
        viewerValidUntil: viewerValidUntil ? new Date(viewerValidUntil) : null,
        insuranceExecutiveValidUntil: insuranceExecutiveValidUntil ? new Date(insuranceExecutiveValidUntil) : null,
        requiresApproval: requiresApproval ?? true,
        allowAssociateJobs: allowAssociateJobs ?? false,
      },
      include: {
        organization: true,
        users: true,
        fields: true,
      },
    });

    res.status(201).json({
      success: true,
      data: branch,
      message: 'Branch created successfully',
    });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateBranch = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      address,
      invoiceAddress,
      isActive,
      branchType,
      externalBranchId,
      countryCode,
      dealerId,
      managerValidUntil,
      associateValidUntil,
      viewerValidUntil,
      insuranceExecutiveValidUntil,
      requiresApproval,
      allowAssociateJobs,
    } = req.body as UpdateBranchDto;

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(address !== undefined && { address }),
        ...(invoiceAddress !== undefined && { invoiceAddress }),
        ...(isActive !== undefined && { isActive }),
        ...(branchType !== undefined && { branchType }),
        ...(externalBranchId !== undefined && { externalBranchId }),
        ...(countryCode !== undefined && { countryCode }),
        ...(dealerId !== undefined && { dealerId }),
        ...(managerValidUntil !== undefined && {
          managerValidUntil: managerValidUntil ? new Date(managerValidUntil) : null,
        }),
        ...(associateValidUntil !== undefined && {
          associateValidUntil: associateValidUntil ? new Date(associateValidUntil) : null,
        }),
        ...(viewerValidUntil !== undefined && {
          viewerValidUntil: viewerValidUntil ? new Date(viewerValidUntil) : null,
        }),
        ...(insuranceExecutiveValidUntil !== undefined && {
          insuranceExecutiveValidUntil: insuranceExecutiveValidUntil ? new Date(insuranceExecutiveValidUntil) : null,
        }),
        ...(requiresApproval !== undefined && { requiresApproval }),
        ...(allowAssociateJobs !== undefined && { allowAssociateJobs }),
      },
      include: {
        organization: true,
        users: true,
        fields: true,
      },
    });

    res.json({
      success: true,
      data: branch,
      message: 'Branch updated successfully',
    });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteBranch = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.branch.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Branch deleted successfully',
    });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Branch Fields
export const addBranchField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fieldName, fieldValue } = req.body;

    const field = await prisma.branchField.upsert({
      where: {
        branchId_fieldName: {
          branchId: id,
          fieldName,
        },
      },
      update: { fieldValue },
      create: {
        branchId: id,
        fieldName,
        fieldValue,
      },
    });

    res.json({
      success: true,
      data: field,
      message: 'Field added/updated successfully',
    });
  } catch (error) {
    console.error('Add branch field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteBranchField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id, fieldId } = req.params;

    await prisma.branchField.delete({
      where: {
        id: fieldId,
        branchId: id,
      },
    });

    res.json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Delete branch field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Update timeline for specific role
export const updateRoleTimeline = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, validUntil } = req.body;

    const updateData: any = {};
    
    if (role === 'MANAGER') {
      updateData.managerValidUntil = validUntil ? new Date(validUntil) : null;
    } else if (role === 'ASSOCIATE') {
      updateData.associateValidUntil = validUntil ? new Date(validUntil) : null;
    } else if (role === 'VIEWER') {
      updateData.viewerValidUntil = validUntil ? new Date(validUntil) : null;
    } else if (role === 'INSURANCE_EXECUTIVE') {
      updateData.insuranceExecutiveValidUntil = validUntil ? new Date(validUntil) : null;
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid role specified',
      });
      return;
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: updateData,
      include: {
        organization: true,
        users: true,
      },
    });

    res.json({
      success: true,
      data: branch,
      message: `${role} timeline updated successfully`,
    });
  } catch (error) {
    console.error('Update role timeline error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

