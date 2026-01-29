import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, CreateScreenDto, UpdateScreenDto, CreateScreenFieldDto, UpdateScreenFieldDto } from '../types';
import { FieldType, Prisma } from '@prisma/client';

export const getAllScreens = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const screens = await prisma.screen.findMany({
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { flowScreens: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: screens,
    });
  } catch (error) {
    console.error('Get screens error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getScreenById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const screen = await prisma.screen.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
        flowScreens: {
          include: {
            flow: true,
          },
        },
      },
    });

    if (!screen) {
      res.status(404).json({
        success: false,
        error: 'Screen not found',
      });
      return;
    }

    res.json({
      success: true,
      data: screen,
    });
  } catch (error) {
    console.error('Get screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const createScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { name, code, description, requiresApproval, requiresInsuranceApproval, isPostApproval } = req.body as CreateScreenDto;

    // Check if code already exists
    const existing = await prisma.screen.findUnique({
      where: { code },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Screen code already exists',
      });
      return;
    }

    const screen = await prisma.screen.create({
      data: {
        name,
        code: code.toUpperCase().replace(/\s+/g, '_'),
        description,
        requiresApproval: requiresApproval ?? false,
        requiresInsuranceApproval: requiresInsuranceApproval ?? false,
        isPostApproval: isPostApproval ?? false,
      },
      include: {
        fields: true,
      },
    });

    res.status(201).json({
      success: true,
      data: screen,
      message: 'Screen created successfully',
    });
  } catch (error) {
    console.error('Create screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, isActive, requiresApproval, requiresInsuranceApproval, isPostApproval } = req.body as UpdateScreenDto;

    const screen = await prisma.screen.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(requiresApproval !== undefined && { requiresApproval }),
        ...(requiresInsuranceApproval !== undefined && { requiresInsuranceApproval }),
        ...(isPostApproval !== undefined && { isPostApproval }),
      },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: screen,
      message: 'Screen updated successfully',
    });
  } catch (error) {
    console.error('Update screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if screen is used in any flow
    const flowScreens = await prisma.flowScreen.findMany({
      where: { screenId: id },
    });

    if (flowScreens.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete screen that is used in flows. Remove it from flows first.',
      });
      return;
    }

    await prisma.screen.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Screen deleted successfully',
    });
  } catch (error) {
    console.error('Delete screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Screen Fields
export const addScreenField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const {
      screenId,
      name,
      label,
      fieldType,
      placeholder,
      defaultValue,
      isRequired,
      validationRegex,
      validationMessage,
      minLength,
      maxLength,
      minValue,
      maxValue,
      options,
      conditionalField,
      conditionalValue,
      sortOrder,
      visibleToManager,
      visibleToAssociate,
      visibleToViewer,
      editableByManager,
      editableByAssociate,
      editableByViewer,
    } = req.body as CreateScreenFieldDto;

    // Check if field name already exists in screen
    const existing = await prisma.screenField.findUnique({
      where: {
        screenId_name: {
          screenId,
          name,
        },
      },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Field name already exists in this screen',
      });
      return;
    }

    // Get max sort order if not provided
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const maxOrder = await prisma.screenField.findFirst({
        where: { screenId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      finalSortOrder = (maxOrder?.sortOrder ?? -1) + 1;
    }

    const field = await prisma.screenField.create({
      data: {
        screenId,
        name,
        label,
        fieldType: fieldType as FieldType,
        placeholder,
        defaultValue,
        isRequired: isRequired ?? false,
        validationRegex,
        validationMessage,
        minLength,
        maxLength,
        minValue,
        maxValue,
        options: options ? JSON.stringify(options) : Prisma.JsonNull,
        conditionalField: conditionalField || null,
        conditionalValue: conditionalValue || null,
        sortOrder: finalSortOrder,
        visibleToManager: visibleToManager ?? true,
        visibleToAssociate: visibleToAssociate ?? true,
        visibleToViewer: visibleToViewer ?? true,
        editableByManager: editableByManager ?? true,
        editableByAssociate: editableByAssociate ?? true,
        editableByViewer: editableByViewer ?? false,
      },
    });

    res.status(201).json({
      success: true,
      data: field,
      message: 'Field added successfully',
    });
  } catch (error) {
    console.error('Add screen field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateScreenField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { fieldId } = req.params;
    const updateData = req.body as UpdateScreenFieldDto;

    const data: any = {};
    
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.label !== undefined) data.label = updateData.label;
    if (updateData.fieldType !== undefined) data.fieldType = updateData.fieldType as FieldType;
    if (updateData.placeholder !== undefined) data.placeholder = updateData.placeholder;
    if (updateData.defaultValue !== undefined) data.defaultValue = updateData.defaultValue;
    if (updateData.isRequired !== undefined) data.isRequired = updateData.isRequired;
    if (updateData.validationRegex !== undefined) data.validationRegex = updateData.validationRegex;
    if (updateData.validationMessage !== undefined) data.validationMessage = updateData.validationMessage;
    if (updateData.minLength !== undefined) data.minLength = updateData.minLength;
    if (updateData.maxLength !== undefined) data.maxLength = updateData.maxLength;
    if (updateData.minValue !== undefined) data.minValue = updateData.minValue;
    if (updateData.maxValue !== undefined) data.maxValue = updateData.maxValue;
    if (updateData.options !== undefined) data.options = updateData.options ? JSON.stringify(updateData.options) : Prisma.JsonNull;
    if (updateData.conditionalField !== undefined) data.conditionalField = updateData.conditionalField || null;
    if (updateData.conditionalValue !== undefined) data.conditionalValue = updateData.conditionalValue || null;
    if (updateData.sortOrder !== undefined) data.sortOrder = updateData.sortOrder;
    if (updateData.visibleToManager !== undefined) data.visibleToManager = updateData.visibleToManager;
    if (updateData.visibleToAssociate !== undefined) data.visibleToAssociate = updateData.visibleToAssociate;
    if (updateData.visibleToViewer !== undefined) data.visibleToViewer = updateData.visibleToViewer;
    if (updateData.editableByManager !== undefined) data.editableByManager = updateData.editableByManager;
    if (updateData.editableByAssociate !== undefined) data.editableByAssociate = updateData.editableByAssociate;
    if (updateData.editableByViewer !== undefined) data.editableByViewer = updateData.editableByViewer;

    const field = await prisma.screenField.update({
      where: { id: fieldId },
      data,
    });

    res.json({
      success: true,
      data: field,
      message: 'Field updated successfully',
    });
  } catch (error) {
    console.error('Update screen field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteScreenField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { fieldId } = req.params;

    await prisma.screenField.delete({
      where: { id: fieldId },
    });

    res.json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Delete screen field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Reorder fields
export const reorderScreenFields = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fieldOrders } = req.body as { fieldOrders: { fieldId: string; sortOrder: number }[] };

    await prisma.$transaction(
      fieldOrders.map(({ fieldId, sortOrder }) =>
        prisma.screenField.update({
          where: { id: fieldId, screenId: id },
          data: { sortOrder },
        })
      )
    );

    const screen = await prisma.screen.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: screen,
      message: 'Fields reordered successfully',
    });
  } catch (error) {
    console.error('Reorder screen fields error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

