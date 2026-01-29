import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, CreateUserDto, UpdateUserDto } from '../types';

export const getAllUsers = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { branchId, organizationId, role } = req.query;

    const where: any = {};
    
    if (branchId) {
      where.branchId = branchId as string;
    }
    
    if (organizationId) {
      where.branch = {
        organizationId: organizationId as string,
      };
    }
    
    if (role) {
      where.role = role as string;
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
        fields: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Remove password from response
    const usersWithoutPassword = users.map(({ password, ...user }) => user);

    res.json({
      success: true,
      data: usersWithoutPassword,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
        fields: true,
        formSubmissions: {
          include: {
            flow: true,
            approvals: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const createUser = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const {
      username,
      password,
      firstName,
      lastName,
      email,
      phone,
      role,
      branchId,
      externalUserId,
      externalLoginId,
      externalRoleId,
      validUntil,
    } = req.body as CreateUserDto;

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Username already exists',
      });
      return;
    }

    // Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      res.status(400).json({
        success: false,
        error: 'Branch not found',
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        firstName,
        lastName,
        email,
        phone,
        role,
        branchId,
        externalUserId: externalUserId || null,
        externalLoginId: externalLoginId || null,
        externalRoleId: externalRoleId || null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
        fields: true,
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      message: 'User created successfully',
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateUser = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      password,
      firstName,
      lastName,
      email,
      phone,
      role,
      isActive,
      externalUserId,
      externalLoginId,
      externalRoleId,
      validUntil,
    } = req.body as UpdateUserDto;

    const updateData: any = {};
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (externalUserId !== undefined) {
      updateData.externalUserId = externalUserId || null;
    }
    if (externalLoginId !== undefined) {
      updateData.externalLoginId = externalLoginId || null;
    }
    if (externalRoleId !== undefined) {
      updateData.externalRoleId = externalRoleId || null;
    }
    if (validUntil !== undefined) {
      updateData.validUntil = validUntil ? new Date(validUntil) : null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
        fields: true,
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// User Fields
export const addUserField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fieldName, fieldValue } = req.body;

    const field = await prisma.userField.upsert({
      where: {
        userId_fieldName: {
          userId: id,
          fieldName,
        },
      },
      update: { fieldValue },
      create: {
        userId: id,
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
    console.error('Add user field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteUserField = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id, fieldId } = req.params;

    await prisma.userField.delete({
      where: {
        id: fieldId,
        userId: id,
      },
    });

    res.json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Delete user field error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Extend user validity
export const extendUserValidity = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { validUntil } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
      },
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword,
      message: 'User validity extended successfully',
    });
  } catch (error) {
    console.error('Extend user validity error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Reset user password
export const resetUserPassword = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

