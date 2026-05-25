import { Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Job Runner service URL (runs on Windows host machine)
const JOB_RUNNER_URL = process.env.JOB_RUNNER_URL || 'http://host.docker.internal:3002';

async function resolveDealerCode(req: AuthRequest): Promise<string | null> {
  const branchId = req.user?.branchId;
  if (!branchId) return null;

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { dealerId: true },
  });
  if (!branch?.dealerId) return null;
  return String(branch.dealerId);
}

/**
 * Get current OTP value for the authenticated user's branch (keyed by Dealer ID).
 */
export const getOtp = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const dealerCode = await resolveDealerCode(req);
    if (!dealerCode) {
      res.status(400).json({
        success: false,
        error: 'Branch Dealer ID is not configured. Contact Super Admin.',
      });
      return;
    }

    const response = await axios.get(`${JOB_RUNNER_URL}/otp`, {
      params: { dealerCode },
      timeout: 5000,
    });

    res.json({
      success: true,
      data: {
        tvs_otp: response.data.tvs_otp || '',
        dealerCode,
      },
    });
  } catch (error: any) {
    console.error('Error getting OTP from job runner:', error.message);

    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to get OTP configuration',
    });
  }
};

/**
 * Update OTP for the authenticated user's branch (keyed by Dealer ID).
 */
export const updateOtp = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { otp } = req.body;

    if (!otp || !/^\d{4}$/.test(otp.toString())) {
      res.status(400).json({
        success: false,
        error: 'OTP must be exactly 4 digits',
      });
      return;
    }

    const dealerCode = await resolveDealerCode(req);
    if (!dealerCode) {
      res.status(400).json({
        success: false,
        error: 'Branch Dealer ID is not configured. Contact Super Admin.',
      });
      return;
    }

    const response = await axios.post(
      `${JOB_RUNNER_URL}/otp/update`,
      { otp: otp.toString(), dealerCode },
      {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data.success) {
      res.json({
        success: true,
        data: {
          message: 'OTP updated successfully',
          tvs_otp: response.data.tvs_otp,
          dealerCode,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: response.data.error || 'Failed to update OTP',
      });
    }
  } catch (error: any) {
    console.error('Error updating OTP via job runner:', error.message);

    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.response?.data?.error || 'Failed to update OTP configuration',
    });
  }
};
