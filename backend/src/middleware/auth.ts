import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest, JwtPayload, ApiResponse } from '../types';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

export const authenticate = async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Access token is required',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    
    // Verify user still exists and is active
    if (decoded.type === 'user' && decoded.id) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { branch: true },
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'User account is inactive or not found',
        });
        return;
      }

      // Check user validity
      if (user.validUntil && new Date(user.validUntil) < new Date()) {
        res.status(401).json({
          success: false,
          error: 'Your login has expired. Please contact administrator.',
        });
        return;
      }

      // Check branch role validity
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
          error: `Your ${user.role.toLowerCase()} access has expired for this branch.`,
        });
        return;
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token has expired',
      });
      return;
    }
    
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
};

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  if (!req.user || req.user.type !== 'superadmin') {
    res.status(403).json({
      success: false,
      error: 'Super admin access required',
    });
    return;
  }
  next();
};

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (req.user.type === 'superadmin') {
      next();
      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
};

export const requireSuperAdminOrRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (req.user.type === 'superadmin') {
      next();
      return;
    }

    if (req.user.role && roles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  };
};

