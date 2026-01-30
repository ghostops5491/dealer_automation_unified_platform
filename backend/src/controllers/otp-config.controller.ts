import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../types';

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Job Runner service URL (runs on Windows host machine)
const JOB_RUNNER_URL = process.env.JOB_RUNNER_URL || 'http://host.docker.internal:3002';

/**
 * Get current OTP value from the job runner service
 */
export const getOtp = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const response = await axios.get(`${JOB_RUNNER_URL}/otp`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      data: {
        tvs_otp: response.data.tvs_otp || '',
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
 * Update OTP value via the job runner service
 */
export const updateOtp = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { otp } = req.body;

    // Validate OTP is exactly 4 digits
    if (!otp || !/^\d{4}$/.test(otp.toString())) {
      res.status(400).json({
        success: false,
        error: 'OTP must be exactly 4 digits',
      });
      return;
    }

    const response = await axios.post(
      `${JOB_RUNNER_URL}/otp/update`,
      { otp: otp.toString() },
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
