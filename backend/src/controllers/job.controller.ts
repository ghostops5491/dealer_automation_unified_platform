import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';

// Job Runner service URL (runs on Windows host machine)
// When running in Docker, 'host.docker.internal' refers to the host machine
const JOB_RUNNER_URL = process.env.JOB_RUNNER_URL || 'http://host.docker.internal:3002';

export const runJobForAllEntries = async (req: Request, res: Response) => {
  try {
    console.log(`Forwarding run-all request to job runner: ${JOB_RUNNER_URL}/jobs/run-all`);
    
    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-all`, {}, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start job'
    });
  }
};

export const runJobForLastEntry = async (req: Request, res: Response) => {
  try {
    console.log(`Forwarding run-last request to job runner: ${JOB_RUNNER_URL}/jobs/run-last`);
    
    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-last`, {}, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start job'
    });
  }
};

export const runBookingJob = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryNo, bookingAmount, otp, vehicle, submodel, headless } = req.body;

    if (!enquiryNo) {
      return res.status(400).json({ success: false, error: 'enquiryNo is required' });
    }
    if (!otp) {
      return res.status(400).json({ success: false, error: 'otp is required (configure TVS OTP on Dashboard)' });
    }
    if (!vehicle) {
      return res.status(400).json({ success: false, error: 'vehicle (variant) is required' });
    }
    if (!submodel) {
      return res.status(400).json({ success: false, error: 'submodel is required' });
    }

    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(401).json({ success: false, error: 'Authenticated branch required' });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { fields: true },
    });
    if (!branch) {
      return res.status(404).json({ success: false, error: 'Branch not found' });
    }
    if (!branch.dealerId) {
      return res.status(400).json({ success: false, error: 'Branch.dealerId is not configured for this branch' });
    }

    const paymentMode =
      branch.fields.find((f) => f.fieldName === 'PAYMENT_MODE_ID')?.fieldValue || '1';

    const user = req.user?.id
      ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { externalRoleId: true } })
      : null;
    const roleId = user?.externalRoleId != null ? String(user.externalRoleId) : '3';

    const payload = {
      enquiryNo,
      bookingAmount,
      otp,
      vehicle,
      submodel,
      dealerCode: String(branch.dealerId),
      roleId,
      branchName: branch.name,
      paymentMode,
      // Forward only if explicitly provided; otherwise job_runner falls back to its env default
      ...(typeof headless === 'boolean' ? { headless } : {}),
    };

    console.log(`Forwarding run-booking request to job runner: ${JOB_RUNNER_URL}/jobs/run-booking`);
    console.log('Payload:', { ...payload, otp: '[redacted]' });

    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-booking`, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }

    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start booking job'
    });
  }
};

export const runAllotmentJob = async (req: Request, res: Response) => {
  try {
    const { enquiryNo, chassisNo, bookingNo, headless } = req.body;

    if (!enquiryNo) {
      return res.status(400).json({
        success: false,
        error: 'enquiryNo is required'
      });
    }

    console.log(`Forwarding run-allotment request to job runner: ${JOB_RUNNER_URL}/jobs/run-allotment`);
    console.log(`Enquiry No: ${enquiryNo}, Chassis: ${chassisNo ?? '(not set)'}, Booking No: ${bookingNo ?? '(not set)'}, Headless: ${typeof headless === 'boolean' ? headless : '(default)'}`);

    const allotmentPayload = {
      enquiryNo,
      chassisNo,
      bookingNo,
      ...(typeof headless === 'boolean' ? { headless } : {}),
    };

    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-allotment`,
      allotmentPayload,
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }

    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start allotment job'
    });
  }
};

export const runEnquiryJob = async (req: Request, res: Response) => {
  try {
    const { enquiryNo } = req.body;
    
    if (!enquiryNo) {
      return res.status(400).json({
        success: false,
        error: 'enquiryNo is required'
      });
    }
    
    console.log(`Forwarding run-enquiry request to job runner: ${JOB_RUNNER_URL}/jobs/run-enquiry`);
    console.log(`Enquiry No: ${enquiryNo}`);
    
    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-enquiry`, 
      { enquiryNo },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start enquiry job'
    });
  }
};

export const runInsuranceJob = async (req: Request, res: Response) => {
  try {
    const { enquiryNo, submissionId } = req.body;
    
    if (!enquiryNo) {
      return res.status(400).json({
        success: false,
        error: 'enquiryNo is required'
      });
    }
    
    console.log(`Forwarding run-insurance request to job runner: ${JOB_RUNNER_URL}/jobs/run-insurance`);
    console.log(`Enquiry No: ${enquiryNo}, Submission ID: ${submissionId}`);
    
    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/run-insurance`, 
      { enquiryNo, submissionId },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error calling job runner:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to start insurance job'
    });
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const response = await axios.get(`${JOB_RUNNER_URL}/jobs/${jobId}`, {
      timeout: 5000
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error getting job status:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running'
      });
    }
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to get job status'
    });
  }
};

export const stopJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const response = await axios.post(`${JOB_RUNNER_URL}/jobs/${jobId}/stop`, {}, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error stopping job:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to stop job'
    });
  }
};

export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${JOB_RUNNER_URL}/jobs`, {
      timeout: 5000
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error getting jobs:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Job Runner service is not running. Please start job_runner.py on your Windows machine.',
        hint: 'Run: python C:\\Users\\yashc\\Desktop\\Auto_Unified_Platform\\job_runner\\job_runner.py',
        jobs: []
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to get jobs',
      jobs: []
    });
  }
};
