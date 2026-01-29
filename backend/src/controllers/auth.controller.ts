import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { ApiResponse, JwtPayload, AuthRequest } from '../types';
import { UserRole } from '@prisma/client';

export const loginSuperAdmin = async (
  req: Request<{}, ApiResponse, { username: string; password: string }>,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { username, password } = req.body;

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { username },
    });

    if (!superAdmin) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, superAdmin.password);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const payload: JwtPayload = {
      id: superAdmin.id,
      username: superAdmin.username,
      type: 'superadmin',
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string,
    } as jwt.SignOptions);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: superAdmin.id,
          username: superAdmin.username,
          type: 'superadmin',
        },
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('SuperAdmin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const loginUser = async (
  req: Request<{}, ApiResponse, { username: string; password: string }>,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Your account is inactive. Please contact administrator.',
      });
      return;
    }

    // Check user validity
    if (user.validUntil && new Date(user.validUntil) < new Date()) {
      res.status(401).json({
        success: false,
        error: 'Your login has expired. Please contact administrator to renew.',
      });
      return;
    }

    // Check branch validity for the role
    const roleValidityMap: Record<UserRole, Date | null> = {
      MANAGER: user.branch.managerValidUntil,
      ASSOCIATE: user.branch.associateValidUntil,
      VIEWER: user.branch.viewerValidUntil,
      INSURANCE_EXECUTIVE: user.branch.insuranceExecutiveValidUntil,
    };

    const roleValidity = roleValidityMap[user.role];
    if (roleValidity && new Date(roleValidity) < new Date()) {
      res.status(401).json({
        success: false,
        error: `${user.role} access has expired for this branch. Please contact administrator.`,
      });
      return;
    }

    // Check branch is active
    if (!user.branch.isActive) {
      res.status(401).json({
        success: false,
        error: 'Your branch is currently inactive.',
      });
      return;
    }

    // Check organization is active
    if (!user.branch.organization.isActive) {
      res.status(401).json({
        success: false,
        error: 'Your organization is currently inactive.',
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      type: 'user',
      role: user.role,
      branchId: user.branchId,
      organizationId: user.branch.organizationId,
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string,
    } as jwt.SignOptions);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          type: 'user',
          branch: {
            id: user.branch.id,
            name: user.branch.name,
            code: user.branch.code,
            address: user.branch.address,
          },
          organization: {
            id: user.branch.organization.id,
            name: user.branch.organization.name,
            code: user.branch.organization.code,
            logo: user.branch.organization.logo,
          },
        },
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getMe = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    if (req.user.type === 'superadmin') {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: req.user.id },
      });

      res.json({
        success: true,
        data: {
          id: superAdmin?.id,
          username: superAdmin?.username,
          type: 'superadmin',
        },
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        branch: {
          include: {
            organization: true,
          },
        },
        fields: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        type: 'user',
        validUntil: user.validUntil,
        branch: {
          id: user.branch.id,
          name: user.branch.name,
          code: user.branch.code,
          address: user.branch.address,
          requiresApproval: user.branch.requiresApproval,
        },
        organization: {
          id: user.branch.organization.id,
          name: user.branch.organization.name,
          code: user.branch.organization.code,
          logo: user.branch.organization.logo,
        },
        fields: user.fields,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

