import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, CreateOrganizationDto, UpdateOrganizationDto } from '../types';

export const getAllOrganizations = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        branches: {
          include: {
            _count: {
              select: { users: true },
            },
          },
        },
        fields: true,
        _count: {
          select: { branches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: organizations,
    });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getOrganizationById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        branches: {
          include: {
            users: true,
            fields: true,
            _count: {
              select: { users: true },
            },
          },
        },
        fields: true,
      },
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
      return;
    }

    res.json({
      success: true,
      data: organization,
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const createOrganization = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { 
      name, 
      code, 
      description, 
      logo,
      legalName,
      ownerName,
      address,
      gstNumber,
      panNumber,
    } = req.body as CreateOrganizationDto;

    // Check if code already exists
    const existing = await prisma.organization.findUnique({
      where: { code },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Organization code already exists',
      });
      return;
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
        logo,
        legalName,
        ownerName,
        address,
        gstNumber,
        panNumber,
      },
      include: {
        branches: true,
        fields: true,
      },
    });

    res.status(201).json({
      success: true,
      data: organization,
      message: 'Organization created successfully',
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateOrganization = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      isActive, 
      logo,
      legalName,
      ownerName,
      address,
      gstNumber,
      panNumber,
    } = req.body as UpdateOrganizationDto;

    const organization = await prisma.organization.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(logo !== undefined && { logo }),
        ...(legalName !== undefined && { legalName }),
        ...(ownerName !== undefined && { ownerName }),
        ...(address !== undefined && { address }),
        ...(gstNumber !== undefined && { gstNumber }),
        ...(panNumber !== undefined && { panNumber }),
      },
      include: {
        branches: true,
        fields: true,
      },
    });

    res.json({
      success: true,
      data: organization,
      message: 'Organization updated successfully',
    });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteOrganization = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.organization.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Organization deleted successfully',
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Organization Fields
export const addOrganizationField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fieldName, fieldValue } = req.body;

    const field = await prisma.organizationField.upsert({
      where: {
        organizationId_fieldName: {
          organizationId: id,
          fieldName,
        },
      },
      update: { fieldValue },
      create: {
        organizationId: id,
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
    console.error('Add organization field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteOrganizationField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id, fieldId } = req.params;

    await prisma.organizationField.delete({
      where: {
        id: fieldId,
        organizationId: id,
      },
    });

    res.json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Delete organization field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

