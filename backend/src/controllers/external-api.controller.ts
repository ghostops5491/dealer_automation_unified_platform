import { Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types';

const prisma = new PrismaClient();

// API Endpoints for different branch types
const API_ENDPOINTS = {
  TVS: {
    tokenGeneration: 'https://www.advantagetvs.in/OnlineSalesWebAPI/Login/TokenGeneration',
    searchEnquiry: 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SearchEnquiry',
  },
  HONDA: {
    tokenGeneration: '', // Add Honda endpoint when available
    searchEnquiry: '',
  }
};

interface TVSSearchRequest {
  DEALER_ID: number;
  BRANCH_ID: number;
  FROM_DT: string;
  TO_DT: string;
  ENQUIRY_NO: number | null;
  CONTACT_NO: string | null;
  CUST_NAME: string | null;
  USER_ID: number;
  COUNTRY_CODE: string;
}

interface TVSTokenRequest {
  DealerId: number;
  BranchId: number;
  RoleId: number;
  LoginId: string;
  UserId: number;
}

interface TVSEnquiry {
  ENQUIRY_ID: number;
  ENQUIRY_NO: number;
  CUST_NAME: string;
  CONTACT_NO: string;
  MODEL: string;
  SALE_MODE_DESCRIPTION: string;
  CUST_TYPE: string;
  ENQUIRY_DATE: string;
  SALES_PERSON: string;
  END_USER: string;
  STATUS_DESC: string;
  CUSTOMER_ID: number;
  ENQUIRY_DESCRIPTION: string;
  Booked: number;
}

// Store tokens in memory with expiration (simple cache)
const tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();

// Map TVS API response to CRM form fields
// Note: Field names must match exactly with the screen field names defined in seed.ts
function mapTVSResponseToCRM(enquiry: TVSEnquiry): Record<string, any> {
  const fullName = enquiry.CUST_NAME?.trim() || '';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  return {
    // Customer Enquiry screen fields
    'customer_enquiry.company_brand': 'TVS',
    'customer_enquiry.enquiry_no': enquiry.ENQUIRY_NO?.toString() || '',
    'customer_enquiry.enquiry': enquiry.ENQUIRY_DESCRIPTION || '',
    'customer_enquiry.enquiry_status': enquiry.STATUS_DESC || '',
    'customer_enquiry.vehicle_model': enquiry.MODEL || '',
    'customer_enquiry.first_name': firstName,
    'customer_enquiry.last_name': lastName,
    'customer_enquiry.mobile_no': enquiry.CONTACT_NO || '',
    'customer_enquiry.ownership_type': enquiry.CUST_TYPE?.toLowerCase() || 'individual',
    'customer_enquiry.sale_mode': enquiry.SALE_MODE_DESCRIPTION || '',
    'customer_enquiry.rep_name': enquiry.SALES_PERSON?.trim() || '',
    'customer_enquiry.registered_user': enquiry.END_USER?.trim() || '',
    
    // Vehicle Details screen fields
    'vehicle_details.model': enquiry.MODEL || '',
    
    // Amounts & Tax screen fields
    'amounts_tax.payment_mode': mapPaymentMode(enquiry.SALE_MODE_DESCRIPTION),
    
    // Metadata
    '_source': 'TVS_API',
    '_fetched_at': new Date().toISOString(),
    '_enquiry_id': enquiry.ENQUIRY_ID?.toString() || '',
    '_customer_id': enquiry.CUSTOMER_ID?.toString() || '',
    '_status': enquiry.STATUS_DESC || '',
    '_enquiry_date': enquiry.ENQUIRY_DATE?.split('T')[0] || '',
    '_booked': enquiry.Booked ?? 0,
    '_enquiry_description': enquiry.ENQUIRY_DESCRIPTION || '',
  };
}

function mapPaymentMode(mode: string | null): string {
  if (!mode) return '';
  const modeMap: Record<string, string> = {
    'Cash': 'cash',
    'Cheque': 'cheque',
    'NEFT': 'neft',
    'RTGS': 'rtgs',
    'UPI': 'upi',
    'Debit Card': 'debit_card',
    'Credit Card': 'credit_card',
    'Bank Finance': 'bank_finance',
    'Auto Loan': 'auto_loan'
  };
  return modeMap[mode] || mode.toLowerCase().replace(/\s+/g, '_');
}

// Generate token from TVS API
async function generateTVSToken(
  dealerId: number,
  branchId: number,
  roleId: number,
  loginId: string,
  userId: number
): Promise<string> {
  const cacheKey = `tvs_${dealerId}_${branchId}_${userId}`;
  
  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > new Date()) {
    console.log('Using cached TVS token');
    return cached.token;
  }

  console.log('Generating new TVS token...');
  const tokenRequest: TVSTokenRequest = {
    DealerId: dealerId,
    BranchId: branchId,
    RoleId: roleId,
    LoginId: loginId,
    UserId: userId,
  };

  try {
    const response = await axios.post(
      API_ENDPOINTS.TVS.tokenGeneration,
      tokenRequest,
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://www.advantagetvs.in',
          'Referer': 'https://www.advantagetvs.in/LiteApp/session/signin',
        },
        timeout: 30000,
      }
    );

    console.log('Token generation response:', JSON.stringify(response.data, null, 2));

    // The response should contain access_key
    const token = response.data?.access_key || response.data?.data?.access_key;
    
    if (!token) {
      console.error('No token in response:', response.data);
      throw new Error('No access_key in token response');
    }

    // Cache token for 7 hours (tokens typically expire in 8 hours based on the JWT)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 7);
    tokenCache.set(cacheKey, { token, expiresAt });

    return token;
  } catch (error: any) {
    console.error('Token generation failed:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to generate token');
  }
}

export const fetchEnquiryDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryNumber, mobileNumber, authToken } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!enquiryNumber && !mobileNumber) {
      return res.status(400).json({
        success: false,
        error: 'Please provide either Enquiry Number or Mobile Number'
      });
    }

    // Get user and branch details for API credentials
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const branch = user.branch;

    // Check if branch has required API credentials
    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({
        success: false,
        error: 'Branch is not configured for external API. Please set Dealer ID and Branch ID in branch settings.',
        missingFields: {
          dealerId: !branch.dealerId,
          externalBranchId: !branch.externalBranchId
        }
      });
    }

    if (!user.externalUserId) {
      return res.status(400).json({
        success: false,
        error: 'User is not configured for external API. Please set External User ID in user settings.'
      });
    }

    // Determine which token to use
    let token = authToken;
    
    // If no manual token provided, try to auto-generate
    if (!token) {
      // Check if user has credentials for auto-generation
      if (!user.externalLoginId || !user.externalRoleId) {
        return res.status(400).json({
          success: false,
          error: 'Cannot auto-generate token. Please configure External Login ID and Role ID in user settings, or provide a manual auth token.',
          missingFields: {
            externalLoginId: !user.externalLoginId,
            externalRoleId: !user.externalRoleId
          }
        });
      }

      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId
        );
      } catch (tokenError: any) {
        return res.status(502).json({
          success: false,
          error: `TVS token generation failed: ${tokenError.message}`,
          hint: 'You can also manually provide an auth token'
        });
      }
    }

    const endpoint = API_ENDPOINTS[branch.branchType]?.searchEnquiry;
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: `API endpoint not configured for branch type: ${branch.branchType}`
      });
    }

    // Build search request - search within last 30 days by default
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);

    const searchRequest: TVSSearchRequest = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      FROM_DT: fromDate.toISOString(),
      TO_DT: toDate.toISOString(),
      ENQUIRY_NO: enquiryNumber ? parseInt(enquiryNumber) : null,
      CONTACT_NO: mobileNumber || null,
      CUST_NAME: null,
      USER_ID: user.externalUserId,
      COUNTRY_CODE: branch.countryCode || 'IN'
    };

    console.log('Calling TVS API:', endpoint);
    console.log('Request:', JSON.stringify(searchRequest, null, 2));

    // Call external API
    const response = await axios.post(endpoint, searchRequest, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 30000
    });

    console.log('TVS API Response:', JSON.stringify(response.data, null, 2));

    if (response.data.statusCode !== 200) {
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to fetch data from external API'
      });
    }

    const enquiryList = response.data.data?.EnquiryList || [];

    if (enquiryList.length === 0) {
      const errorMessage = mobileNumber
        ? 'Mobile number not found. Please try searching with Enquiry ID instead.'
        : 'No enquiry found with the provided Enquiry ID.';
      return res.status(404).json({
        success: false,
        error: errorMessage
      });
    }

    // If multiple results, return the list for user to select
    if (enquiryList.length > 1) {
      return res.json({
        success: true,
        multiple: true,
        count: enquiryList.length,
        enquiries: enquiryList.map((e: TVSEnquiry) => ({
          enquiryId: e.ENQUIRY_ID,
          enquiryNo: e.ENQUIRY_NO,
          customerName: e.CUST_NAME,
          mobile: e.CONTACT_NO,
          model: e.MODEL,
          status: e.STATUS_DESC,
          date: e.ENQUIRY_DATE,
          booked: e.Booked ?? 0,
          enquiryDescription: e.ENQUIRY_DESCRIPTION || '',
        }))
      });
    }

    // Single result - map and return (booked status is handled by frontend UI)
    const enquiry = enquiryList[0];
    const mappedData = mapTVSResponseToCRM(enquiry);

    res.json({
      success: true,
      multiple: false,
      data: mappedData,
      rawData: enquiry
    });

  } catch (error: any) {
    console.error('Error fetching enquiry:', error);

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          error: 'Unable to connect to external API'
        });
      }
      if (error.response?.status === 401) {
        return res.status(502).json({
          success: false,
          error: 'TVS API: Invalid or expired authorization token. Token will be regenerated on next request.'
        });
      }
      return res.status(error.response?.status === 401 ? 502 : (error.response?.status || 500)).json({
        success: false,
        error: error.response?.data?.message || error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch enquiry details'
    });
  }
};

// Get a specific enquiry by ID (when user selects from multiple results)
export const fetchEnquiryById = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId, authToken } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!enquiryId) {
      return res.status(400).json({
        success: false,
        error: 'Enquiry ID is required'
      });
    }

    // Get user and branch details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user || !user.branch.dealerId || !user.branch.externalBranchId || !user.externalUserId) {
      return res.status(400).json({
        success: false,
        error: 'API credentials not configured'
      });
    }

    const branch = user.branch;
    
    // Determine which token to use
    let token = authToken;
    
    if (!token && user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId!,
          branch.externalBranchId!,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId!
        );
      } catch (tokenError: any) {
        return res.status(502).json({
          success: false,
          error: `TVS token generation failed: ${tokenError.message}`
        });
      }
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'No auth token available'
      });
    }

    const endpoint = API_ENDPOINTS[branch.branchType]?.searchEnquiry;

    // Search by enquiry number
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1); // Search last year
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);

    const searchRequest: TVSSearchRequest = {
      DEALER_ID: branch.dealerId!,
      BRANCH_ID: branch.externalBranchId!,
      FROM_DT: fromDate.toISOString(),
      TO_DT: toDate.toISOString(),
      ENQUIRY_NO: parseInt(enquiryId),
      CONTACT_NO: null,
      CUST_NAME: null,
      USER_ID: user.externalUserId!,
      COUNTRY_CODE: branch.countryCode || 'IN'
    };

    const response = await axios.post(endpoint, searchRequest, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 30000
    });

    if (response.data.statusCode !== 200 || !response.data.data?.EnquiryList?.length) {
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found'
      });
    }

    const enquiry = response.data.data.EnquiryList[0];
    const mappedData = mapTVSResponseToCRM(enquiry);

    res.json({
      success: true,
      data: mappedData,
      rawData: enquiry
    });

  } catch (error: any) {
    console.error('Error fetching enquiry by ID:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch enquiry'
    });
  }
};

// Pre-fetch booking data using SearchEnquiry (same proven API as Fetch Details)
// Maps response to amounts_tax fields for pre-filling
export const preFetchBookingData = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryNo, authToken } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!enquiryNo) {
      return res.status(400).json({ success: false, error: 'Enquiry number is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    if (!user.externalUserId) {
      return res.status(400).json({ success: false, error: 'User External User ID not configured' });
    }

    // Get or generate token
    let token = authToken;
    if (!token) {
      if (!user.externalLoginId || !user.externalRoleId) {
        return res.status(400).json({ success: false, error: 'Cannot auto-generate token. Configure External Login ID and Role ID.' });
      }
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId
        );
      } catch (tokenError: any) {
        return res.status(400).json({ success: false, error: `Token generation failed: ${tokenError.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'No auth token available' });
    }

    // Use the same SearchEnquiry API that Fetch Details uses
    const endpoint = API_ENDPOINTS[branch.branchType]?.searchEnquiry;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: `API endpoint not configured for branch type: ${branch.branchType}` });
    }

    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);

    const searchRequest: TVSSearchRequest = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      FROM_DT: fromDate.toISOString(),
      TO_DT: toDate.toISOString(),
      ENQUIRY_NO: parseInt(enquiryNo),
      CONTACT_NO: null,
      CUST_NAME: null,
      USER_ID: user.externalUserId,
      COUNTRY_CODE: branch.countryCode || 'IN',
    };

    console.log('Pre-fetch booking via SearchEnquiry:', JSON.stringify(searchRequest, null, 2));

    const response = await axios.post(endpoint, searchRequest, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: 30000,
    });

    if (response.data.statusCode !== 200 || !response.data.data?.EnquiryList?.length) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' });
    }

    const enquiry: TVSEnquiry = response.data.data.EnquiryList[0];

    // Map to amounts_tax fields
    const mappedData: Record<string, any> = {
      'amounts_tax.payment_mode': mapPaymentMode(enquiry.SALE_MODE_DESCRIPTION),
    };

    // Include all available enquiry data for reference
    mappedData['_source'] = 'TVS_API_PREFETCH';
    mappedData['_fetched_at'] = new Date().toISOString();
    mappedData['_raw_keys'] = Object.keys(enquiry);

    res.json({
      success: true,
      data: mappedData,
      rawData: enquiry,
    });

  } catch (error: any) {
    console.error('Error pre-fetching booking data:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(502).json({ success: false, error: 'TVS API: Invalid or expired token. Will regenerate on next request.' });
      }
      return res.status(error.response?.status === 401 ? 502 : (error.response?.status || 500)).json({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to pre-fetch booking data' });
  }
};

// Check API configuration status for current user
export const checkApiConfig = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const branch = user.branch;
    const isConfigured = !!(branch.dealerId && branch.externalBranchId && user.externalUserId);
    const canAutoGenerateToken = !!(user.externalLoginId && user.externalRoleId);

    res.json({
      success: true,
      isConfigured,
      canAutoGenerateToken,
      config: {
        branchType: branch.branchType,
        dealerId: branch.dealerId,
        externalBranchId: branch.externalBranchId,
        countryCode: branch.countryCode,
        externalUserId: user.externalUserId,
        externalLoginId: user.externalLoginId,
        externalRoleId: user.externalRoleId,
      },
      missing: {
        dealerId: !branch.dealerId,
        externalBranchId: !branch.externalBranchId,
        externalUserId: !user.externalUserId,
        externalLoginId: !user.externalLoginId,
        externalRoleId: !user.externalRoleId,
      }
    });

  } catch (error: any) {
    console.error('Error checking API config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Generate token manually (for testing or refresh)
export const generateToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const branch = user.branch;

    // Validate required fields
    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({
        success: false,
        error: 'Branch Dealer ID and External Branch ID are required'
      });
    }

    if (!user.externalUserId || !user.externalLoginId || !user.externalRoleId) {
      return res.status(400).json({
        success: false,
        error: 'User External User ID, Login ID, and Role ID are required'
      });
    }

    const token = await generateTVSToken(
      branch.dealerId,
      branch.externalBranchId,
      user.externalRoleId,
      user.externalLoginId,
      user.externalUserId
    );

    res.json({
      success: true,
      message: 'Token generated successfully',
      // Don't expose the full token for security, just confirm it works
      tokenPreview: token.substring(0, 20) + '...',
      expiresIn: '7 hours'
    });

  } catch (error: any) {
    console.error('Error generating token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate token'
    });
  }
};

// Clear cached token (useful for forcing refresh)
export const clearTokenCache = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const branch = user.branch;
    const cacheKey = `tvs_${branch.dealerId}_${branch.externalBranchId}_${user.externalUserId}`;
    
    tokenCache.delete(cacheKey);

    res.json({
      success: true,
      message: 'Token cache cleared. A new token will be generated on next request.'
    });

  } catch (error: any) {
    console.error('Error clearing token cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Enquiry cache directory
const ENQUIRY_CACHE_DIR = path.join(process.cwd(), 'uploads', 'enquiry-cache');

function ensureEnquiryCacheDir() {
  if (!fs.existsSync(ENQUIRY_CACHE_DIR)) {
    fs.mkdirSync(ENQUIRY_CACHE_DIR, { recursive: true });
  }
}

// Automation-captured FormatVehicleModel template (from Playwright booking runs)
const AUTOMATION_CACHE_DIR = path.join(process.cwd(), 'uploads', 'automation');
const FORMAT_VEHICLE_TEMPLATE_FILE = 'format-vehicle-model-latest.json';
const FORMAT_VEHICLE_API_URL =
  'https://www.advantagetvs.in/OnlineSalesWebAPI/MultiVehicle/FormatVehicleModel';

function ensureAutomationCacheDir() {
  if (!fs.existsSync(AUTOMATION_CACHE_DIR)) {
    fs.mkdirSync(AUTOMATION_CACHE_DIR, { recursive: true });
  }
}

function getFormatVehicleTemplatePath() {
  return path.join(AUTOMATION_CACHE_DIR, FORMAT_VEHICLE_TEMPLATE_FILE);
}

function loadFormatVehicleTemplateRecord(): {
  capturedAt?: string;
  enquiryNo?: string;
  url?: string;
  payload?: Record<string, unknown>;
} | null {
  const filePath = getFormatVehicleTemplatePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return parsed?.payload ? parsed : null;
  } catch {
    return null;
  }
}

function saveFormatVehicleTemplateRecord(record: {
  capturedAt: string;
  enquiryNo?: string;
  url?: string;
  payload: Record<string, unknown>;
}) {
  ensureAutomationCacheDir();
  fs.writeFileSync(getFormatVehicleTemplatePath(), JSON.stringify(record, null, 2), 'utf-8');
}

function mergeFormatVehiclePayload(
  template: Record<string, unknown>,
  overrides: { enquiryId?: string }
): Record<string, unknown> {
  const body = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;

  if (overrides.enquiryId) {
    body.ENQUIRY_ID = overrides.enquiryId;
    body.ENQUIRY_NO = overrides.enquiryId;
    body.EnquiryId = overrides.enquiryId;
    body.enquiryId = overrides.enquiryId;
  }

  return body;
}

const FORMAT_VEHICLE_RESPONSE_FILE = 'format-vehicle-model-response-latest.json';

function saveFormatVehicleResponse(response: unknown) {
  ensureAutomationCacheDir();
  fs.writeFileSync(
    path.join(AUTOMATION_CACHE_DIR, FORMAT_VEHICLE_RESPONSE_FILE),
    JSON.stringify({ fetchedAt: new Date().toISOString(), response }, null, 2),
    'utf-8'
  );
}

function loadFormatVehicleResponse(): unknown | null {
  const filePath = path.join(AUTOMATION_CACHE_DIR, FORMAT_VEHICLE_RESPONSE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return parsed?.response ?? null;
  } catch {
    return null;
  }
}

/** TVS returns data: [{ group, items: [...] }] */
function getFormatVehicleGroupEntries(tvsResponse: any): Array<{ group: string; items: any[] }> {
  const data = tvsResponse?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((entry) => entry && entry.group != null);
}

function parseFormatVehicleGroups(tvsResponse: any): Array<{ value: string; label: string }> {
  return getFormatVehicleGroupEntries(tvsResponse).map((entry) => ({
    value: String(entry.group),
    label: String(entry.group),
  }));
}

function parseFormatVehicleSubModelsForGroup(
  tvsResponse: any,
  group: string
): Array<{ value: string; label: string; raw: unknown }> {
  const entry = getFormatVehicleGroupEntries(tvsResponse).find(
    (g) => String(g.group).toLowerCase() === String(group).toLowerCase()
  );
  const items: any[] = entry?.items || [];
  return items.map((item) => ({
    value: String(item.MODEL_ID),
    label: String(item.DESCRIPTION || item.MODEL_ID),
    raw: item,
  }));
}

function findFormatVehicleGroupForModelId(
  tvsResponse: any,
  modelId: string
): { group: string; submodelLabel: string; submodelValue: string } | null {
  const normalizedId = String(modelId).trim();
  if (!normalizedId) return null;

  for (const entry of getFormatVehicleGroupEntries(tvsResponse)) {
    const item = (entry.items || []).find(
      (i: any) => String(i.MODEL_ID || i.ModelId || '').trim() === normalizedId
    );
    if (item) {
      return {
        group: String(entry.group),
        submodelLabel: String(item.DESCRIPTION || item.MODEL_ID || normalizedId),
        submodelValue: normalizedId,
      };
    }
  }
  return null;
}

type TvsVariantOption = {
  value: string;
  label: string;
  modelId: string;
  partId: string;
  partIds: string[];
  originalVariant: string;
};

function mapModelPartsToVariantOptions(parts: any[], modelId: string): TvsVariantOption[] {
  return parts
    .map((part) => {
      const description = String(part.DESCRIPTION || part.Description || '').trim();
      const partIdVal = String(part.PART_ID || part.PartId || part.partId || '');
      const modelIdVal = String(part.MODEL_ID || part.ModelId || modelId);
      if (!description || !partIdVal) return null;
      return {
        value: `${modelIdVal}|||${description}`,
        label: description,
        modelId: modelIdVal,
        partId: partIdVal,
        partIds: [partIdVal],
        originalVariant: description,
      };
    })
    .filter((v): v is TvsVariantOption => v !== null);
}

function resolveVariantByPartId(
  variants: TvsVariantOption[],
  partId: string
): TvsVariantOption | null {
  const normalizedPartId = String(partId).trim();
  if (!normalizedPartId) return null;
  return variants.find((v) => v.partId === normalizedPartId) || null;
}

async function fetchTvsModelParts(token: string, modelId: string, countryCode = 'IN'): Promise<any[]> {
  const apiUrl = `https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/GetModelPart?ModelId=${encodeURIComponent(modelId)}&CountryCode=${encodeURIComponent(countryCode)}`;
  const response = await axios.get(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.advantagetvs.in',
      Referer: 'https://www.advantagetvs.in/LiteApp/',
    },
    timeout: 30000,
  });
  const responseData = response.data;
  const parts: any[] = responseData?.data || responseData || [];
  return Array.isArray(parts) ? parts : [];
}

/** Resolve Model (group) → SubModel → Variant from pre-booking MODEL_ID + PART_ID. */
async function resolveTvsVehicleCascade(params: {
  token: string;
  enquiryId: string;
  modelId: string;
  partId?: string;
}): Promise<{
  resolved: boolean;
  warnings: string[];
  catalogOptions?: {
    groups: Array<{ value: string; label: string }>;
    submodels: Array<{ value: string; label: string }>;
    variants: TvsVariantOption[];
  };
  cascade?: {
    brand: string;
    model: string;
    submodel: string;
    submodelLabel: string;
    variant: string;
    variantValue: string;
    partId: string;
    modelId: string;
  };
}> {
  const warnings: string[] = [];
  const normalizedModelId = String(params.modelId || '').trim();
  if (!normalizedModelId) {
    return { resolved: false, warnings: ['MODEL_ID is missing from pre-booking data'] };
  }

  const templateRecord = loadFormatVehicleTemplateRecord();
  if (!templateRecord?.payload) {
    return {
      resolved: false,
      warnings: ['No FormatVehicleModel template. Run Perform Booking automation once to capture the TVS payload.'],
    };
  }

  let tvsResponse = loadFormatVehicleResponse();
  if (!tvsResponse) {
    try {
      const requestBody = mergeFormatVehiclePayload(templateRecord.payload, {
        enquiryId: params.enquiryId,
      });
      tvsResponse = await callFormatVehicleModelApi(params.token, requestBody);
      saveFormatVehicleResponse(tvsResponse);
    } catch (err: any) {
      return {
        resolved: false,
        warnings: [`FormatVehicleModel fetch failed: ${err.message || 'Unknown error'}`],
      };
    }
  }

  const groups = parseFormatVehicleGroups(tvsResponse);
  const groupMatch = findFormatVehicleGroupForModelId(tvsResponse, normalizedModelId);
  if (!groupMatch) {
    return {
      resolved: false,
      warnings: [`MODEL_ID ${normalizedModelId} not found in FormatVehicleModel catalog`],
      catalogOptions: { groups, submodels: [], variants: [] },
    };
  }

  const submodels = parseFormatVehicleSubModelsForGroup(tvsResponse, groupMatch.group).map((s) => ({
    value: s.value,
    label: s.label,
  }));

  let variants: TvsVariantOption[] = [];
  try {
    const parts = await fetchTvsModelParts(params.token, normalizedModelId);
    variants = mapModelPartsToVariantOptions(parts, normalizedModelId);

    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `model-parts-${normalizedModelId}.json`);
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        modelId: normalizedModelId,
        countryCode: 'IN',
        fetchedAt: new Date().toISOString(),
        source: 'resolveTvsVehicleCascade',
        partsCount: parts.length,
        response: parts,
      }, null, 2),
      'utf-8'
    );
  } catch (err: any) {
    warnings.push(`GetModelPart failed: ${err.message || 'Unknown error'}`);
  }

  const cascade: {
    brand: string;
    model: string;
    submodel: string;
    submodelLabel: string;
    variant: string;
    variantValue: string;
    partId: string;
    modelId: string;
  } = {
    brand: 'TVS',
    model: groupMatch.group,
    submodel: groupMatch.submodelValue,
    submodelLabel: groupMatch.submodelLabel,
    variant: '',
    variantValue: '',
    partId: params.partId ? String(params.partId).trim() : '',
    modelId: normalizedModelId,
  };

  if (params.partId) {
    const variantMatch = resolveVariantByPartId(variants, params.partId);
    if (variantMatch) {
      cascade.variant = variantMatch.label;
      cascade.variantValue = variantMatch.value;
      cascade.partId = variantMatch.partId;
    } else {
      warnings.push(`PART_ID ${params.partId} not found in GetModelPart variants for MODEL_ID ${normalizedModelId}`);
    }
  } else {
    warnings.push('PART_ID missing from pre-booking — Model and SubModel selected; pick Variant manually');
  }

  return {
    resolved: true,
    warnings,
    catalogOptions: { groups, submodels, variants },
    cascade,
  };
}

async function callFormatVehicleModelApi(
  token: string,
  requestBody: Record<string, unknown>
): Promise<any> {
  const apiResponse = await axios.post(FORMAT_VEHICLE_API_URL, requestBody, {
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.advantagetvs.in',
      Referer: 'https://www.advantagetvs.in/LiteApp/',
    },
    timeout: 30000,
  });
  return apiResponse.data;
}

// Populate enquiry details by ID via TVS API and cache the response as a JSON file
export const populateEnquiryById = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!enquiryId) {
      return res.status(400).json({ success: false, error: 'Enquiry ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    if (!user.externalUserId) {
      return res.status(400).json({ success: false, error: 'User External User ID not configured' });
    }

    // Generate token
    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId
        );
      } catch (tokenError: any) {
        return res.status(400).json({ success: false, error: `Token generation failed: ${tokenError.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'Cannot generate auth token. Configure External Login ID and Role ID.' });
    }

    // Call PopulateEnquiryDetailsById (GET with query params)
    const apiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/PopulateEnquiryDetailsById';

    console.log(`PopulateEnquiryDetailsById: DealerId=${branch.dealerId}, BranchId=${branch.externalBranchId}, EnqId=${enquiryId}`);

    const response = await axios.get(apiUrl, {
      params: {
        DealerId: branch.dealerId,
        BranchId: branch.externalBranchId,
        EnqId: parseInt(enquiryId),
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    console.log('PopulateEnquiryDetailsById response status:', response.data?.statusCode);

    const responseData = response.data;

    // Save response to file keyed by enquiryId
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `${enquiryId}.json`);
    const cachePayload = {
      enquiryId: String(enquiryId),
      dealerId: branch.dealerId,
      branchId: branch.externalBranchId,
      fetchedBy: user.username,
      fetchedAt: new Date().toISOString(),
      response: responseData,
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2), 'utf-8');
    console.log(`Enquiry data cached: ${cacheFile}`);

    res.json({
      success: true,
      data: responseData?.data || responseData,
      cachedAs: `${enquiryId}.json`,
    });

  } catch (error: any) {
    console.error('Error in populateEnquiryById:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(502).json({ success: false, error: 'TVS API: Invalid or expired token' });
      }
      return res.status(error.response?.status === 401 ? 502 : (error.response?.status || 500)).json({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch enquiry details' });
  }
};

// Get cached enquiry data by enquiryId (read from file)
export const getCachedEnquiry = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId } = req.params;

    if (!enquiryId) {
      return res.status(400).json({ success: false, error: 'Enquiry ID is required' });
    }

    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `${enquiryId}.json`);

    if (!fs.existsSync(cacheFile)) {
      return res.status(404).json({ success: false, error: 'No cached data found for this enquiry' });
    }

    const raw = fs.readFileSync(cacheFile, 'utf-8');
    const cached = JSON.parse(raw);

    res.json({ success: true, data: cached });

  } catch (error: any) {
    console.error('Error reading cached enquiry:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to read cached data' });
  }
};

// List all cached enquiry files
export const listCachedEnquiries = async (req: AuthRequest, res: Response) => {
  try {
    ensureEnquiryCacheDir();
    const files = fs.readdirSync(ENQUIRY_CACHE_DIR).filter(f => f.endsWith('.json'));

    const entries = files.map(f => {
      try {
        const raw = fs.readFileSync(path.join(ENQUIRY_CACHE_DIR, f), 'utf-8');
        const data = JSON.parse(raw);
        return {
          enquiryId: data.enquiryId,
          fetchedBy: data.fetchedBy,
          fetchedAt: data.fetchedAt,
          filename: f,
        };
      } catch {
        return { enquiryId: f.replace('.json', ''), filename: f };
      }
    });

    res.json({ success: true, data: entries, count: entries.length });

  } catch (error: any) {
    console.error('Error listing cached enquiries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

import { getBranchConfig, getIndianFinancialYear } from './branch-config.controller';

// Fetch pre-booking data via SelectedEnquiryByID with full booking body

export const fetchPreBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!enquiryId) {
      return res.status(400).json({ success: false, error: 'Enquiry ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    if (!user.externalUserId) {
      return res.status(400).json({ success: false, error: 'User External User ID not configured' });
    }

    // Generate token
    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId
        );
      } catch (tokenError: any) {
        return res.status(400).json({ success: false, error: `Token generation failed: ${tokenError.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'Cannot generate auth token' });
    }

    const pbConfig = await getBranchConfig(branchId);

    const requestBody = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      ENQUIRY_ID: String(enquiryId),
      DealerCountry: branch.countryCode || pbConfig.DealerCountry,
      DealerState: pbConfig.DealerState,
      INS_COMP_ID: pbConfig.INS_COMP_ID,
      INS_TYPE_ID: pbConfig.INS_TYPE_ID,
      REG_TYPE_ID: pbConfig.REG_TYPE_ID,
      RTO_ID: pbConfig.RTO_ID,
    };

    console.log('SelectedEnquiryByID (Pre-Booking) request:', JSON.stringify(requestBody, null, 2));

    const apiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SelectedEnquiryByID';
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    console.log('SelectedEnquiryByID (Pre-Booking) response statusCode:', response.data?.statusCode);

    const responseData = response.data;
    const rawData = responseData?.data || responseData;

    // Save response to file: pre-booking-{enquiryId}.json
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
    const cachePayload = {
      enquiryId: String(enquiryId),
      type: 'pre-booking',
      dealerId: branch.dealerId,
      branchId: branch.externalBranchId,
      requestBody,
      fetchedBy: user.username,
      fetchedAt: new Date().toISOString(),
      response: responseData,
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2), 'utf-8');
    console.log(`Pre-booking data cached: ${cacheFile}`);

    // Debug: Log the response structure to understand nesting
    console.log('Pre-booking rawData type:', typeof rawData);
    console.log('Pre-booking rawData top-level keys:', rawData ? Object.keys(rawData) : 'null');
    if (rawData?.BookingPartDetails) {
      console.log('BookingPartDetails found, length:', rawData.BookingPartDetails.length);
      if (rawData.BookingPartDetails[0]) {
        console.log('BookingPartDetails[0] keys:', Object.keys(rawData.BookingPartDetails[0]));
      }
    }
    if (rawData?.TaxDetails) {
      console.log('TaxDetails found, length:', rawData.TaxDetails.length);
      if (rawData.TaxDetails[0]) {
        console.log('TaxDetails[0] keys:', Object.keys(rawData.TaxDetails[0]));
        console.log('TaxDetails[0] sample:', JSON.stringify(rawData.TaxDetails[0]));
      }
    }

    // Try multiple nesting levels to find the booking data
    const booking = rawData?.BookingPartDetails?.[0] || rawData;

    // Helper: search for a field across multiple possible locations in the API response
    function findField(fieldName: string): any {
      if (rawData?.BookingPartDetails?.[0]?.[fieldName] !== undefined) return rawData.BookingPartDetails[0][fieldName];
      if (rawData?.[fieldName] !== undefined) return rawData[fieldName];
      if (rawData?.Customer?.[fieldName] !== undefined) return rawData.Customer[fieldName];
      if (rawData?.Enquiry?.[fieldName] !== undefined) return rawData.Enquiry[fieldName];
      if (rawData?.EnquiryList?.[0]?.[fieldName] !== undefined) return rawData.EnquiryList[0][fieldName];
      return undefined;
    }

    // Find tax details — API returns BookingPartTaxList (not TaxDetails)
    const taxDetails: any[] =
      rawData?.BookingPartDetails?.[0]?.BookingPartTaxList ||
      rawData?.BookingPartDetails?.[0]?.TaxDetails ||
      rawData?.TaxDetails ||
      booking?.TaxDetails ||
      [];

    const mappedFields: Record<string, any> = {};

    // Vehicle Details fields
    const customerId = findField('CUSTOMER_ID');
    const modelId = findField('MODEL_ID');
    const partId = findField('PART_ID');
    const comStateId = findField('COM_STATE_ID');
    if (customerId !== undefined) mappedFields['vehicle_details.customer_id'] = String(customerId);
    if (modelId !== undefined) mappedFields['vehicle_details.model_id'] = String(modelId);
    if (comStateId !== undefined) mappedFields['vehicle_details.rto_state'] = String(comStateId);
    // stock_available is set from LoadVehicleFrameforAllotment frame count when Variant is selected

    // Amounts & Tax fields
    const unitPrice = findField('UNIT_PRICE');
    const exShrmPrice = findField('EX_SHRM_PRICE');
    const taxAmount = findField('TAX_AMOUNT');
    const totalAmount = findField('TOTAL_AMOUNT');
    const bookedQty = findField('BOOKED_QTY');
    const pendingQty = findField('PENDING_QTY');

    if (unitPrice !== undefined) mappedFields['amounts_tax.base_amount'] = unitPrice;
    if (exShrmPrice !== undefined) {
      mappedFields['amounts_tax.ex_showroom_price'] = exShrmPrice;
      mappedFields['vehicle_details.ex_showroom_price'] = exShrmPrice;
    }
    if (taxAmount !== undefined) mappedFields['amounts_tax.tax_amount'] = taxAmount;
    if (totalAmount !== undefined) {
      mappedFields['amounts_tax.total_amount'] = totalAmount;
      mappedFields['vehicle_details.vehicle_total_price'] = totalAmount;
    }
    if (bookedQty !== undefined) mappedFields['amounts_tax.booked_qty'] = bookedQty;
    if (pendingQty !== undefined) mappedFields['amounts_tax.pending_qty'] = pendingQty;

    // Extract CGST and SGST from tax details array
    const cgst = taxDetails.find((t: any) =>
      t.DESCRIPTION === 'CGST' || t.TAX_TYPE === 'CGST' || t.TAX_NAME?.includes('CGST') || t.TaxType === 'CGST' || t.TaxName?.includes('CGST')
    );
    const sgst = taxDetails.find((t: any) =>
      t.DESCRIPTION === 'SGST' || t.TAX_TYPE === 'SGST' || t.TAX_NAME?.includes('SGST') || t.TaxType === 'SGST' || t.TaxName?.includes('SGST')
    );

    let cgstValue = 0;
    let sgstValue = 0;

    if (cgst) {
      const perc = cgst.TAX_PERC ?? cgst.TAX_PERCENTAGE ?? cgst.TaxPerc ?? cgst.TaxPercentage ?? 0;
      const applied = cgst.APPLIED_AMT ?? cgst.APPLIED_AMOUNT ?? cgst.AppliedAmt ?? cgst.AppliedAmount ?? 0;
      const taxVal = cgst.TaxValue ?? cgst.TAX_VALUE ?? cgst.TAX_AMOUNT ?? cgst.TaxAmount ?? 0;
      cgstValue = Number(taxVal) || 0;
      mappedFields['amounts_tax.cgst_line'] = `CGST = ${perc}% on ${applied} = ${taxVal}`;
      mappedFields['_cgst_perc'] = perc;
      mappedFields['_cgst_applied'] = applied;
      mappedFields['_cgst_value'] = taxVal;
    }

    if (sgst) {
      const perc = sgst.TAX_PERC ?? sgst.TAX_PERCENTAGE ?? sgst.TaxPerc ?? sgst.TaxPercentage ?? 0;
      const applied = sgst.APPLIED_AMT ?? sgst.APPLIED_AMOUNT ?? sgst.AppliedAmt ?? sgst.AppliedAmount ?? 0;
      const taxVal = sgst.TaxValue ?? sgst.TAX_VALUE ?? sgst.TAX_AMOUNT ?? sgst.TaxAmount ?? 0;
      sgstValue = Number(taxVal) || 0;
      mappedFields['amounts_tax.sgst_line'] = `SGST = ${perc}% on ${applied} = ${taxVal}`;
      mappedFields['_sgst_perc'] = perc;
      mappedFields['_sgst_applied'] = applied;
      mappedFields['_sgst_value'] = taxVal;
    }

    if (cgstValue > 0) {
      mappedFields['vehicle_details.cgst_amount'] = parseFloat(cgstValue.toFixed(2));
    }
    if (sgstValue > 0) {
      mappedFields['vehicle_details.sgst_amount'] = parseFloat(sgstValue.toFixed(2));
    }

    if (mappedFields['vehicle_details.vehicle_total_price'] === undefined && exShrmPrice !== undefined) {
      mappedFields['vehicle_details.vehicle_total_price'] = parseFloat(
        (Number(exShrmPrice) + cgstValue + sgstValue).toFixed(2)
      );
    } else if (
      mappedFields['vehicle_details.vehicle_total_price'] === undefined &&
      taxAmount !== undefined &&
      exShrmPrice !== undefined
    ) {
      mappedFields['vehicle_details.vehicle_total_price'] = parseFloat(
        (Number(exShrmPrice) + Number(taxAmount)).toFixed(2)
      );
    }

    console.log('Pre-booking mappedFields:', JSON.stringify(mappedFields, null, 2));

    // Resolve TVS Model → SubModel → Variant cascade from pre-booking IDs
    let tvsCascade: Awaited<ReturnType<typeof resolveTvsVehicleCascade>> | null = null;
    if (modelId && token) {
      try {
        tvsCascade = await resolveTvsVehicleCascade({
          token,
          enquiryId: String(enquiryId),
          modelId: String(modelId),
          partId: partId !== undefined ? String(partId) : undefined,
        });
        console.log('Pre-booking tvsCascade:', JSON.stringify(tvsCascade, null, 2));
      } catch (cascadeErr: any) {
        console.warn('Pre-booking TVS cascade resolve failed:', cascadeErr.message);
        tvsCascade = { resolved: false, warnings: [cascadeErr.message || 'Cascade resolve failed'] };
      }
    }

    res.json({
      success: true,
      data: rawData,
      mappedFields,
      tvsCascade,
      cachedAs: `pre-booking-${enquiryId}.json`,
    });

  } catch (error: any) {
    console.error('Error in fetchPreBooking:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(502).json({ success: false, error: 'TVS API: Invalid or expired token' });
      }
      return res.status(error.response?.status === 401 ? 502 : (error.response?.status || 500)).json({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch pre-booking data' });
  }
};

// Fetch model parts from TVS API using MODEL_ID, parse descriptions, and populate VehicleCatalog
export const fetchModelParts = async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, countryCode = 'IN' } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!modelId) {
      return res.status(400).json({ success: false, error: 'modelId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const branch = user.branch;
    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    // Generate token
    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId || 0
        );
      } catch (e: any) {
        return res.status(400).json({ success: false, error: `Token generation failed: ${e.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'No auth token available' });
    }

    const apiUrl = `https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/GetModelPart?ModelId=${encodeURIComponent(modelId)}&CountryCode=${encodeURIComponent(countryCode)}`;

    console.log('GetModelPart request URL:', apiUrl);

    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    const responseData = response.data;
    const parts: any[] = responseData?.data || responseData || [];

    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(404).json({ success: false, error: 'No model parts found for this MODEL_ID' });
    }

    console.log(`GetModelPart returned ${parts.length} parts`);

    // Parse each part's DESCRIPTION to extract Brand, Model, Variant + TVS metadata
    const catalogEntries: Array<{
      brand: string;
      model: string;
      variant: string;
      partId: string;
      modelId: string;
      hsnCode: string;
      hsnId: number;
      itemTypeId: number;
      itemTaxCatId: number;
      series: string;
      isEvModel: boolean;
      exShrmPrice: number;
    }> = [];

    for (const part of parts) {
      const description = (part.DESCRIPTION || part.Description || '').trim();
      const partIdVal = part.PART_ID || part.PartId || part.partId || '';
      const modelIdVal = part.MODEL_ID || part.ModelId || modelId;

      if (!description || !partIdVal) continue;

      const words = description.split(/[\s]+/);
      const brand = words[0] || 'TVS';
      const secondToken = words[1] || '';
      const modelName = secondToken.split('-')[0] || secondToken;

      catalogEntries.push({
        brand,
        model: modelName,
        variant: description,
        partId: String(partIdVal),
        modelId: String(modelIdVal),
        hsnCode: part.HSN_CODE || part.HsnCode || '',
        hsnId: part.HSN_ID || part.HsnId || 0,
        itemTypeId: part.ITEM_TYPE_ID || part.ItemTypeId || 1,
        itemTaxCatId: part.ITEM_TAX_CAT_ID || part.ItemTaxCatId || 4,
        series: part.SERIES || part.Series || modelName,
        isEvModel: part.IS_EV_MODEL || part.IsEvModel || false,
        exShrmPrice: part.CUR_MARKET_PRICE || part.MOV_AVG_PRICE || 0,
      });
    }

    if (catalogEntries.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not parse any model parts from the response' });
    }

    // Upsert into VehicleCatalog — update existing entries with new fields, insert new ones
    let inserted = 0;
    let updated = 0;

    for (const entry of catalogEntries) {
      const existing = await prisma.vehicleCatalog.findFirst({
        where: { branchId, partId: entry.partId },
      });

      if (existing) {
        await prisma.vehicleCatalog.update({
          where: { id: existing.id },
          data: {
            hsnCode: entry.hsnCode || existing.hsnCode,
            hsnId: entry.hsnId || existing.hsnId,
            itemTypeId: entry.itemTypeId || existing.itemTypeId,
            itemTaxCatId: entry.itemTaxCatId || existing.itemTaxCatId,
            series: entry.series || existing.series,
            isEvModel: entry.isEvModel,
            exShrmPrice: entry.exShrmPrice || existing.exShrmPrice,
          },
        });
        updated++;
        continue;
      }

      await prisma.vehicleCatalog.create({
        data: {
          branchId,
          brand: entry.brand,
          model: entry.model,
          variant: entry.variant,
          partId: entry.partId,
          modelId: entry.modelId,
          hsnCode: entry.hsnCode,
          hsnId: entry.hsnId,
          itemTypeId: entry.itemTypeId,
          itemTaxCatId: entry.itemTaxCatId,
          series: entry.series,
          isEvModel: entry.isEvModel,
          exShrmPrice: entry.exShrmPrice,
          colour: '',
          fuelType: '',
        },
      });
      inserted++;
    }

    console.log(`VehicleCatalog: inserted ${inserted}, updated ${updated} (with new fields)`);

    const variants = parts
      .map((part) => {
        const description = String(part.DESCRIPTION || part.Description || '').trim();
        const partIdVal = String(part.PART_ID || part.PartId || part.partId || '');
        const modelIdVal = String(part.MODEL_ID || part.ModelId || modelId);
        if (!description || !partIdVal) return null;
        return {
          value: `${modelIdVal}|||${description}`,
          label: description,
          modelId: modelIdVal,
          partId: partIdVal,
          partIds: [partIdVal],
          originalVariant: description,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    // Cache the raw response
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `model-parts-${modelId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      modelId,
      countryCode,
      fetchedBy: user.username,
      fetchedAt: new Date().toISOString(),
      partsCount: parts.length,
      response: responseData,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: {
        totalParts: parts.length,
        inserted,
        updated,
        brands: [...new Set(catalogEntries.map(e => e.brand))],
        models: [...new Set(catalogEntries.map(e => e.model))],
        variants,
      },
      cachedAs: `model-parts-${modelId}.json`,
    });

  } catch (error: any) {
    console.error('Error in fetchModelParts:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch model parts' });
  }
};

// ==================== SET BOOKING LINE ITEM ====================
// Calls TVS SetBookingLineItem API to set model/part details on the booking
export const setBookingLineItem = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId, partId, brand, model, variant } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!enquiryId) {
      return res.status(400).json({ success: false, error: 'enquiryId is required' });
    }

    if (!partId && !variant) {
      return res.status(400).json({ success: false, error: 'Either partId or variant (with brand + model) is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    // Generate token
    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId || 0
        );
      } catch (e: any) {
        return res.status(502).json({ success: false, error: `TVS token generation failed: ${e.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'No auth token available' });
    }

    // Load branch config
    const pbConfig = await getBranchConfig(branchId);

    // Resolve VehicleCatalog entry — by partId or by brand+model+variant name
    let catalogEntry;
    if (partId) {
      catalogEntry = await prisma.vehicleCatalog.findFirst({
        where: { branchId, partId: String(partId) },
      });
    } else {
      catalogEntry = await prisma.vehicleCatalog.findFirst({
        where: { branchId, brand, model, variant },
      });
    }

    if (!catalogEntry) {
      return res.status(404).json({ success: false, error: 'Selected vehicle variant not found in catalog. Please re-fetch model parts.' });
    }

    // Load pre-booking cached data for amounts and IDs
    ensureEnquiryCacheDir();
    const preBookingCachePath = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
    let preBookingData: any = null;

    if (fs.existsSync(preBookingCachePath)) {
      try {
        const raw = fs.readFileSync(preBookingCachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        preBookingData = parsed.response?.data || parsed.response || parsed;
      } catch (e) {
        console.error('Failed to read pre-booking cache:', e);
      }
    }

    if (!preBookingData) {
      return res.status(400).json({ success: false, error: 'Pre-booking data not found. Please fetch pre-booking first.' });
    }

    const booking = preBookingData.BookingPartDetails?.[0] || preBookingData;
    const customerId = booking.CUSTOMER_ID || preBookingData.CUSTOMER_ID || 0;
    const runningNo = booking.BOOK_PART_ID || booking.RunningNo || 0;
    const unitPrice = booking.UNIT_PRICE || booking.EX_SHRM_PRICE || catalogEntry.exShrmPrice || 0;
    const exShrmPrice = booking.EX_SHRM_PRICE || unitPrice;

    // Tax calculation from pre-booking data
    const taxDetails: any[] = booking.BookingPartTaxList || booking.TaxDetails || preBookingData.TaxDetails || [];
    const cgstEntry = taxDetails.find((t: any) => t.DESCRIPTION === 'CGST' || t.TAX_TYPE_ID === 12);
    const sgstEntry = taxDetails.find((t: any) => t.DESCRIPTION === 'SGST' || t.TAX_TYPE_ID === 11);

    const cgstPerc = cgstEntry?.TAX_PERC || 9;
    const sgstPerc = sgstEntry?.TAX_PERC || 9;
    const totalTaxPerc = cgstPerc + sgstPerc;
    const taxAmount = Math.round((unitPrice * totalTaxPerc / 100) * 100) / 100;
    const cgstValue = Math.round((unitPrice * cgstPerc / 100) * 100) / 100;
    const sgstValue = Math.round((unitPrice * sgstPerc / 100) * 100) / 100;
    const totalAmount = Math.round((unitPrice + taxAmount) * 100) / 100;

    // Load all model parts from cache for the modelPartList
    const modelPartsCachePath = path.join(ENQUIRY_CACHE_DIR, `model-parts-${catalogEntry.modelId}.json`);
    let allModelParts: any[] = [];

    if (fs.existsSync(modelPartsCachePath)) {
      try {
        const raw = fs.readFileSync(modelPartsCachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        allModelParts = parsed.response?.data || parsed.response || [];
      } catch (e) {
        console.error('Failed to read model parts cache:', e);
      }
    }

    // Build ModelPart object for the selected part
    const selectedRawPart = allModelParts.find((p: any) => (p.PART_ID || p.PartId) === partId) || {};
    const buildModelPartObj = (rawPart: any, fallbackCatalog: any) => ({
      IS_EV_MODEL: rawPart.IS_EV_MODEL || fallbackCatalog.isEvModel || false,
      STATE_ID: rawPart.STATE_ID || null,
      DEALER_COUNTRY_CODE_FOR_ANGULAR: branch.countryCode || 'IN',
      DEALER_ID_FOR_ANGULAR: 0,
      BRANCH_ID_FOR_ANGULAR: 0,
      PART_ID: rawPart.PART_ID || fallbackCatalog.partId || '',
      MODEL_ID: rawPart.MODEL_ID || fallbackCatalog.modelId || '',
      ITEM_TYPE_ID: rawPart.ITEM_TYPE_ID || fallbackCatalog.itemTypeId || 1,
      ITEM_TAX_CAT_ID: rawPart.ITEM_TAX_CAT_ID || fallbackCatalog.itemTaxCatId || 4,
      DESCRIPTION: rawPart.DESCRIPTION || fallbackCatalog.variant || null,
      DEMAND_VEHICLE: rawPart.DEMAND_VEHICLE || false,
      MOV_AVG_PRICE: rawPart.MOV_AVG_PRICE || 0,
      CUR_MARKET_PRICE: rawPart.CUR_MARKET_PRICE || 0,
      SERIES: rawPart.SERIES || fallbackCatalog.series || null,
      HSN_CODE: rawPart.HSN_CODE || fallbackCatalog.hsnCode || '',
      APP_FOR_SALE: rawPart.APP_FOR_SALE || false,
      Modified_ON: '0001-01-01T00:00:00',
      ACTIVE: false,
      IS_OLD_VEHICLE: false,
      CATEGORY_ID: null,
      PART_DESC: null,
      COUNTRY_CODE: null,
      DEALER_ID: 0,
      SALES_SL_CODE: 0,
      PURCHASE_SL_CODE: 0,
      HSN_ID: rawPart.HSN_ID || fallbackCatalog.hsnId || 0,
      IS_EV_VEH: rawPart.IS_EV_VEH || false,
      IS_SELECTED: false,
    });

    // Build the modelPartList from all cached parts
    const modelPartList = allModelParts.length > 0
      ? allModelParts.map((p: any) => buildModelPartObj(p, catalogEntry))
      : [buildModelPartObj(selectedRawPart, catalogEntry)];

    // ── Build the request body from pre-booking cache data ──
    const enquiry = preBookingData.Enquiry || {};
    const customer = preBookingData.Customer || {};
    const pbParts: any[] = preBookingData.BookingPartDetails || [];
    const today = new Date();
    const bookingDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const createdOn = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const finYear = Number(getIndianFinancialYear(today));

    // Use the matching part from pre-booking, or first available
    const matchingPart = pbParts.find((p: any) => p.PART_ID === catalogEntry.partId) || pbParts[0] || booking;

    // Compute totals from the part details
    const bookedQty = matchingPart.BOOKED_QTY || 1;
    const totUnitPrice = unitPrice * bookedQty;
    const totLineDisc = (matchingPart.DISC_VALUE || 0) + (matchingPart.MANUAL_DISC || 0) + (matchingPart.SCHEME_DISC || 0);
    const totAccChrgs = matchingPart.ACC_CHARGES || 0;
    const totRegChrgs = matchingPart.REG_CHARGES || 0;
    const totInsChrgs = matchingPart.INS_CHARGES || 0;
    const totSubTot = totalAmount;
    const totAmtDue = totalAmount;

    // Build BookPartDetailsList from pre-booking data, adding modelPartList + ROW_STATE/ROW_SELECT
    const bookPartDetailsList = pbParts.map((part: any) => ({
      ...part,
      ModelPart: part.ModelPart || buildModelPartObj(
        allModelParts.find((p: any) => p.PART_ID === part.PART_ID) || {},
        catalogEntry,
      ),
      ROW_STATE: 'Created',
      ROW_SELECT: part.PART_ID === catalogEntry.partId,
      modelPartList,
    }));

    // If pre-booking had no parts, construct from catalog
    if (bookPartDetailsList.length === 0) {
      bookPartDetailsList.push({
        SelectedSchemes: null,
        ActualDiscount: null,
        DiscountID: 0,
        schemeDiscount: null,
        RunningNo: 0,
        DEALER_ID: branch.dealerId,
        BRANCH_ID: branch.externalBranchId,
        BOOK_PART_ID: runningNo,
        PART_ID: catalogEntry.partId || '',
        DESCRIPTION: null,
        MODEL_ID: catalogEntry.modelId || '',
        UNIT_PRICE: unitPrice,
        STOCK_AVAILABLE: 0,
        STOCK_IN_TRANSIT: 0,
        BOOKED_QTY: 1,
        RESV_QTY: 0,
        ALLOTED_QTY: 0,
        PENDING_QTY: 1,
        EX_SHRM_PRICE: exShrmPrice,
        SCHEME_DISC: 0,
        DISC_VALUE: 0,
        MASTER_DISC: 0,
        MANUAL_DISC: 0,
        TAX: totalTaxPerc,
        CGST: cgstPerc,
        SGST: sgstPerc,
        IGST: null,
        UTGST: null,
        CESS: null,
        HSN_CODE: catalogEntry.hsnCode || '',
        HSN_ID: catalogEntry.hsnId || 0,
        TAX_AMOUNT: taxAmount,
        ACC_CHARGES: 0,
        REG_CHARGES: 0,
        INS_CHARGES: 0,
        OTH_CHARGES: 0,
        ACCESS_LOCATION_ID: null,
        TOTAL_AMOUNT: totalAmount,
        ModelPart: buildModelPartObj(selectedRawPart, catalogEntry),
        ROW_STATE: 'Created',
        VEHICLE_ID: 0,
        STATUS: 0,
        ALLOT_VEH_ID: null,
        PART_DESC: null,
        BookingPartTaxList: [
          { DEALER_ID: branch.dealerId, BRANCH_ID: branch.externalBranchId, BOOK_PART_TAX_ID: 0, BOOK_PART_ID: runningNo, DESCRIPTION: 'CGST', TAX_PERC: cgstPerc, APPLIED_AMT: unitPrice, ROW_STATE: 0, TaxValue: cgstValue, TAX_TYPE_ID: 12, RUNNING_NO: 0 },
          { DEALER_ID: branch.dealerId, BRANCH_ID: branch.externalBranchId, BOOK_PART_TAX_ID: 0, BOOK_PART_ID: runningNo, DESCRIPTION: 'SGST', TAX_PERC: sgstPerc, APPLIED_AMT: unitPrice, ROW_STATE: 0, TaxValue: sgstValue, TAX_TYPE_ID: 11, RUNNING_NO: 0 },
        ],
        BookingSchemeList: null,
        AppVehicleSchemeList: [],
        SelectedVehicleSchemeList: null,
        AccessoryList: null,
        AllotmentList: null,
        SERIES: catalogEntry.series || null,
        IS_EV_VEH: catalogEntry.isEvModel || false,
        VEHICLE_SCH_ID: null,
        ApplicableTax: null,
        AccInvDetails: null,
        modelPartList,
        ROW_SELECT: true,
      });
    }

    const requestBody = {
      IS_ATP_ENABLED: false,
      Is_TRV: false,
      TM_APPROVE_STATUS: 0,
      IS_SERIES_RESTRICTION_ENABLED: false,
      BOOKING_DATE: bookingDate,
      RTO_ID: pbConfig.RTO_ID,
      REGIS_TYPE_ID: pbConfig.REG_TYPE_ID,
      INS_COMP_ID: pbConfig.INS_COMP_ID,
      INS_TYPE_ID: pbConfig.INS_TYPE_ID,
      ENQUIRY_ID: enquiry.ENQUIRY_ID || Number(enquiryId),
      ENQUIRY_NO: enquiry.ENQUIRY_NO || Number(enquiryId),
      BOOKING_TYPE: false,
      ENQUIRY_DATE: enquiry.ENQUIRY_DATE || '',
      BOOKING_TYPE_DESC: 'Single',
      REF_CUST_ID: enquiry.REFERRAL_CUSTOMER_ID || null,
      END_USER_ID: enquiry.END_USER_ID || customer.CUSTOMER_ID || customerId,
      REFERRAL_CUSTOMER_NAME: enquiry.REFERRAL_CUSTOMER_NAME || null,
      REFERRAL_CUSTOMER_TYPE: enquiry.REFERRAL_CUSTOMER_TYPE || null,
      REFERRAL_CUSTOMER_MOBILE_NUMBER: enquiry.REFERRAL_CUSTOMER_MOBILE_NUMBER || null,
      BOOKING_AMT: 0,
      BOOKING_NO: null,
      RefCustomerType: enquiry.RefCustomerType || null,
      SALESMAN_ID: enquiry.SALESMAN_ID || 1,
      CUSTOMER_NAME: customer.CUST_NAME || '',
      CUSTOMER_ID: customer.CUSTOMER_ID || enquiry.CUSTOMER_ID || customerId,
      CUSTOMER_TYPE: customer.CUSTOMER_TYPE || 'Individual',
      SL_CODE: customer.SL_CODE || 0,
      TOT_UNIT_PRICE: totUnitPrice,
      TOT_LINE_DISC: totLineDisc,
      TOT_TAX_VAL: taxAmount,
      TOT_REG_CHRGS: totRegChrgs,
      TOT_ACC_CHRGS: totAccChrgs,
      TOT_SUB_TOT1: totSubTot,
      TOT_SUB_TOT2: totSubTot,
      TOT_BILL_DISC: 0,
      TOT_AMT_DUE: totAmtDue,
      TOT_AMT_PNDG: totAmtDue,
      TOT_ADV_AMT: 0,
      TOT_RFND_AMT: 0,
      QUOTATION_NO: '',
      QUOTATION_DATE: '',
      END_USER: null,
      BookPartDetailsList: bookPartDetailsList,
      ROW_STATE: 'Created',
      CREATED_BY: pbConfig.CREATED_BY || 0,
      CREATED_ON: createdOn,
      ACTIVE: true,
      STATUS: 1,
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      FIN_YEAR: finYear,
      COUNTRY_CODE: pbConfig.DealerCountry || branch.countryCode || 'IN',
      SALE_MODE: enquiry.SALE_MODE || pbConfig.SALE_MODE || 4,
      SLF_ARNGD_HP: false,
      SelfHPDetails: null,
      ExchangeBookList: [],
      CUST_DEL_DATE: '',
      DLR_DEL_DATE: '',
    };

    console.log('SetBookingLineItem request:', JSON.stringify(requestBody, null, 2));

    const apiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SetBookingLineItem';
    const apiResponse = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    console.log('SetBookingLineItem response:', JSON.stringify(apiResponse.data, null, 2));

    // Check TVS-level statusCode (TVS returns HTTP 200 even on errors)
    const tvsStatus = apiResponse.data?.statusCode;
    if (tvsStatus && tvsStatus !== 200) {
      const tvsMsg = apiResponse.data?.message || 'SetBookingLineItem failed on TVS';
      console.error('SetBookingLineItem TVS error:', tvsMsg);

      // Still cache for debugging
      ensureEnquiryCacheDir();
      const errCacheFile = path.join(ENQUIRY_CACHE_DIR, `set-line-item-error-${enquiryId}.json`);
      fs.writeFileSync(errCacheFile, JSON.stringify({
        enquiryId: String(enquiryId),
        error: tvsMsg,
        setBy: user.username,
        setAt: new Date().toISOString(),
        request: requestBody,
        response: apiResponse.data,
      }, null, 2), 'utf-8');

      return res.status(502).json({
        success: false,
        error: tvsMsg,
        tvsStatusCode: tvsStatus,
        details: apiResponse.data,
      });
    }

    // TVS SetBookingLineItem is a "setter" — it often returns data: null on success.
    // When that happens, the pre-booking BookingPartDetails[0] (with BOOK_PART_ID, pricing,
    // taxes) is the authoritative line item data that TVS just accepted.
    const tvsData = apiResponse.data?.data;
    const preBookingPart = preBookingData.BookingPartDetails?.[0] || null;
    const effectiveData = tvsData || preBookingPart;

    // Cache the successful response
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `set-line-item-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      partId,
      modelId: catalogEntry.modelId,
      setBy: user.username,
      setAt: new Date().toISOString(),
      request: requestBody,
      response: apiResponse.data,
      preBookingPart,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: effectiveData,
      requestPartData: requestBody.BookPartDetailsList?.[0] || null,
      setLineItemRequest: requestBody,
      cachedAs: `set-line-item-${enquiryId}.json`,
    });

  } catch (error: any) {
    console.error('Error in setBookingLineItem:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(502).json({ success: false, error: 'TVS API: Invalid or expired token' });
      }
      return res.status(error.response?.status === 401 ? 502 : (error.response?.status || 500)).json({
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to set booking line item' });
  }
};

// ==================== SAVE BOOKING ====================
// Constructs and calls TVS SaveBooking API using pre-booking cache + SetBookingLineItem response
export const saveBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { bookingData, lineItemData, enquiryId: reqEnquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId || 0
        );
      } catch (e: any) {
        return res.status(502).json({ success: false, error: `TVS token generation failed: ${e.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'No auth token available' });
    }

    const enquiryId = reqEnquiryId || bookingData?.ENQUIRY_ID || bookingData?.ENQUIRY_NO || 'unknown';
    ensureEnquiryCacheDir();

    // The set-line-item cache already has the correctly structured request body
    // (flat top-level fields, BookPartDetailsList with modelPartList, taxes, etc.)
    let setLineItemRequest: any = null;
    const sliCachePath = path.join(ENQUIRY_CACHE_DIR, `set-line-item-${enquiryId}.json`);
    if (fs.existsSync(sliCachePath)) {
      try {
        const raw = fs.readFileSync(sliCachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        setLineItemRequest = parsed.request;
      } catch (e) {
        console.error('Failed to read set-line-item cache:', e);
      }
    }

    // Fallback: load pre-booking cache if set-line-item cache is missing
    let preBookingData: any = null;
    const preBookingCachePath = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
    if (fs.existsSync(preBookingCachePath)) {
      try {
        const raw = fs.readFileSync(preBookingCachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        preBookingData = parsed.response?.data || parsed.response || parsed;
      } catch (e) {
        console.error('Failed to read pre-booking cache:', e);
      }
    }

    if (!setLineItemRequest && !preBookingData && !bookingData) {
      return res.status(400).json({ success: false, error: 'No booking data available. Please run SetBookingLineItem first.' });
    }

    // Modal-confirmed values from the frontend
    const confirmedAmt = bookingData?.BOOKING_AMT || 0;
    const confirmedTotUnitPrice = bookingData?.TOT_UNIT_PRICE ?? 0;
    const confirmedAccChrgs = bookingData?.TOT_ACC_CHRGS ?? 0;
    const confirmedRegChrgs = bookingData?.TOT_REG_CHRGS ?? 0;
    const confirmedLineDisc = bookingData?.TOT_LINE_DISC ?? 0;
    const confirmedInsCharges = bookingData?.INS_CHARGES ?? 0;

    let finalBookingData: any;

    if (setLineItemRequest) {
      // Best path: use the exact same structure that was sent to SetBookingLineItem
      // (already flat, has BookPartDetailsList, modelPartList, taxes, etc.)
      // Override only the values the user confirmed in the modal
      const totTax = confirmedTotUnitPrice > 0
        ? (setLineItemRequest.TOT_TAX_VAL ?? Math.round((confirmedTotUnitPrice * 0.18) * 100) / 100)
        : (setLineItemRequest.TOT_TAX_VAL ?? 0);
      const totSubTot = confirmedTotUnitPrice + totTax + confirmedAccChrgs + confirmedRegChrgs - confirmedLineDisc;

      finalBookingData = {
        ...setLineItemRequest,
        BOOKING_AMT: confirmedAmt,
        TOT_UNIT_PRICE: confirmedTotUnitPrice,
        TOT_ACC_CHRGS: confirmedAccChrgs,
        TOT_REG_CHRGS: confirmedRegChrgs,
        TOT_LINE_DISC: confirmedLineDisc,
        INS_CHARGES: confirmedInsCharges,
        TOT_TAX_VAL: totTax,
        TOT_SUB_TOT1: totSubTot,
        TOT_SUB_TOT2: totSubTot,
        TOT_AMT_DUE: totSubTot,
        TOT_AMT_PNDG: totSubTot,
      };
      console.log('SaveBooking: Using set-line-item cached request as base, applied modal overrides');
    } else {
      // Fallback: build from pre-booking cache (less ideal but functional)
      const pb = preBookingData || {};
      const enquiry = pb.Enquiry || {};
      const customer = pb.Customer || {};
      const pbParts: any[] = pb.BookingPartDetails || [];
      const part0 = pbParts[0] || {};

      const pbConfig = await getBranchConfig(branchId);
      const today = new Date();
      const bookingDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const createdOn = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      const finYear = Number(getIndianFinancialYear(today));
      const unitPrice = part0.UNIT_PRICE || part0.EX_SHRM_PRICE || 0;
      const taxAmount = part0.TAX_AMOUNT || 0;
      const totalAmt = part0.TOTAL_AMOUNT || (unitPrice + taxAmount);

      finalBookingData = {
        IS_ATP_ENABLED: false,
        Is_TRV: false,
        TM_APPROVE_STATUS: 0,
        IS_SERIES_RESTRICTION_ENABLED: false,
        BOOKING_DATE: bookingDate,
        RTO_ID: pbConfig.RTO_ID,
        REGIS_TYPE_ID: pbConfig.REG_TYPE_ID,
        INS_COMP_ID: pbConfig.INS_COMP_ID,
        INS_TYPE_ID: pbConfig.INS_TYPE_ID,
        ENQUIRY_ID: enquiry.ENQUIRY_ID || Number(enquiryId),
        ENQUIRY_NO: enquiry.ENQUIRY_NO || Number(enquiryId),
        BOOKING_TYPE: false,
        ENQUIRY_DATE: enquiry.ENQUIRY_DATE || '',
        BOOKING_TYPE_DESC: 'Single',
        REF_CUST_ID: enquiry.REFERRAL_CUSTOMER_ID || null,
        END_USER_ID: enquiry.END_USER_ID || customer.CUSTOMER_ID || 0,
        REFERRAL_CUSTOMER_NAME: enquiry.REFERRAL_CUSTOMER_NAME || null,
        REFERRAL_CUSTOMER_TYPE: enquiry.REFERRAL_CUSTOMER_TYPE || null,
        REFERRAL_CUSTOMER_MOBILE_NUMBER: enquiry.REFERRAL_CUSTOMER_MOBILE_NUMBER || null,
        BOOKING_AMT: confirmedAmt,
        BOOKING_NO: null,
        RefCustomerType: enquiry.RefCustomerType || null,
        SALESMAN_ID: enquiry.SALESMAN_ID || 1,
        CUSTOMER_NAME: customer.CUST_NAME || '',
        CUSTOMER_ID: customer.CUSTOMER_ID || enquiry.CUSTOMER_ID || 0,
        CUSTOMER_TYPE: customer.CUSTOMER_TYPE || 'Individual',
        SL_CODE: customer.SL_CODE || null,
        TOT_UNIT_PRICE: confirmedTotUnitPrice || unitPrice,
        TOT_LINE_DISC: confirmedLineDisc,
        TOT_TAX_VAL: taxAmount,
        TOT_REG_CHRGS: confirmedRegChrgs,
        TOT_ACC_CHRGS: confirmedAccChrgs,
        TOT_SUB_TOT1: totalAmt,
        TOT_SUB_TOT2: totalAmt,
        TOT_BILL_DISC: 0,
        TOT_AMT_DUE: totalAmt,
        TOT_AMT_PNDG: totalAmt,
        TOT_ADV_AMT: 0,
        TOT_RFND_AMT: 0,
        QUOTATION_NO: '',
        QUOTATION_DATE: '',
        END_USER: null,
        BookPartDetailsList: pbParts.map((part: any) => ({
          ...part,
          ROW_STATE: 'Created',
          ROW_SELECT: true,
        })),
        ROW_STATE: 'Created',
        CREATED_BY: pbConfig.CREATED_BY || 0,
        CREATED_ON: createdOn,
        ACTIVE: true,
        STATUS: 1,
        DEALER_ID: branch.dealerId,
        BRANCH_ID: branch.externalBranchId,
        FIN_YEAR: finYear,
        COUNTRY_CODE: pbConfig.DealerCountry || branch.countryCode || 'IN',
        SALE_MODE: enquiry.SALE_MODE || pbConfig.SALE_MODE || 4,
        SLF_ARNGD_HP: false,
        SelfHPDetails: null,
        ExchangeBookList: [],
        CUST_DEL_DATE: '',
        DLR_DEL_DATE: '',
      };
      console.log('SaveBooking: Built payload from pre-booking cache (fallback path)');
    }

    const apiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SaveBooking';

    console.log('SaveBooking request:', JSON.stringify(finalBookingData, null, 2));

    const response = await axios.post(apiUrl, finalBookingData, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    const responseData = response.data;
    console.log('SaveBooking response status:', response.status);

    // Cache the response
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `save-booking-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      savedBy: user.username,
      savedAt: new Date().toISOString(),
      request: finalBookingData,
      lineItemData: lineItemData || null,
      response: responseData,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: responseData,
      cachedAs: `save-booking-${enquiryId}.json`,
    });

  } catch (error: any) {
    console.error('Error in saveBooking:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to save booking' });
  }
};

// ==================== SUBMIT VOUCHER ====================
// Constructs and submits voucher using enquiry/booking data + branch config.
// Called twice: 1st with BOOK_PART_ID before SaveBooking, 2nd with BOOKING_NO after SaveBooking.
// Pass documentIdOverride to use a specific DOCUMENT_ID/DOC_NO/DOC_ID (e.g. BOOKING_NO for the 2nd call).
export const submitVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const { saveBookingResponse, bookingAmount, lineItemData, documentIdOverride, enquiryId: reqEnquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!bookingAmount) {
      return res.status(400).json({ success: false, error: 'bookingAmount is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const branch = user.branch;

    if (!branch.dealerId || !branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    let token: string | undefined;
    if (user.externalLoginId && user.externalRoleId) {
      try {
        token = await generateTVSToken(
          branch.dealerId,
          branch.externalBranchId,
          user.externalRoleId,
          user.externalLoginId,
          user.externalUserId || 0
        );
      } catch (e: any) {
        return res.status(400).json({ success: false, error: `Token generation failed: ${e.message}` });
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'No auth token available' });
    }

    // Load branch config for voucher constants
    const config = await getBranchConfig(branchId);
    const finYear = getIndianFinancialYear();
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const isoDate = today.toISOString();

    // Load pre-booking cache for fallback data (CUSTOMER_ID, names, etc.)
    let preBookingCache: any = null;
    const voucherEnquiryId = reqEnquiryId || '';
    if (voucherEnquiryId) {
      ensureEnquiryCacheDir();
      const pbCachePath = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${voucherEnquiryId}.json`);
      if (fs.existsSync(pbCachePath)) {
        try {
          const raw = fs.readFileSync(pbCachePath, 'utf-8');
          const parsed = JSON.parse(raw);
          preBookingCache = parsed.response?.data || parsed.response || parsed;
          console.log('Voucher: Pre-booking cache loaded. Keys:', Object.keys(preBookingCache));
          console.log('Voucher: pb.Customer?.CUSTOMER_ID =', preBookingCache?.Customer?.CUSTOMER_ID);
          console.log('Voucher: pb.Enquiry?.CUSTOMER_ID =', preBookingCache?.Enquiry?.CUSTOMER_ID);
          console.log('Voucher: pb.BookingPartDetails?.[0]?.BOOK_PART_ID =', preBookingCache?.BookingPartDetails?.[0]?.BOOK_PART_ID);
        } catch (e) {
          console.warn('Failed to read pre-booking cache for voucher:', e);
        }
      } else {
        console.warn(`Voucher: Pre-booking cache not found at ${pbCachePath}`);
      }
    } else {
      console.warn('Voucher: No enquiryId provided — pre-booking cache will NOT be loaded');
    }

    // Navigate into nested response: { BookingDet: {...}, Customer: {...} }
    const bookingDet = saveBookingResponse?.BookingDet || saveBookingResponse || {};
    const customerDet = saveBookingResponse?.Customer || {};
    const lid = lineItemData || {};
    const pb = preBookingCache || {};
    const pbCustomer = pb.Customer || {};
    const pbEnquiry = pb.Enquiry || {};
    const pbPart0 = pb.BookingPartDetails?.[0] || {};

    // Use nullish coalescing (??) for numeric fields that could legitimately be 0
    const dealerId = bookingDet.DEALER_ID || lid.DEALER_ID || branch.dealerId;
    const branchIdExt = bookingDet.BRANCH_ID || lid.BRANCH_ID || branch.externalBranchId;
    const customerName = customerDet.CUST_NAME || bookingDet.CUSTOMER_NAME || bookingDet.PARTY_NAME || pbCustomer.CUST_NAME || pbEnquiry.CUSTOMER_NAME || '';
    const customerId = bookingDet.CUSTOMER_ID ?? customerDet.CUSTOMER_ID ?? lid.CUSTOMER_ID ?? pbCustomer.CUSTOMER_ID ?? pbEnquiry.CUSTOMER_ID ?? '';
    const bookPartId = bookingDet.BookPartDetailsList?.[0]?.BOOK_PART_ID ?? bookingDet.BOOK_PART_ID ?? lid.BOOK_PART_ID ?? pbPart0.BOOK_PART_ID ?? 0;
    const amount = Number(bookingAmount);

    // Ensure documentId is a number (TVS expects numeric DOCUMENT_ID / DOC_NO / DOC_ID)
    const documentId = Number(documentIdOverride || bookPartId) || 0;

    console.log(`Voucher [${documentIdOverride ? '2nd call - BOOKING_NO' : '1st call - BOOK_PART_ID'}] — documentId: ${documentId}, bookPartId: ${bookPartId}, override: ${documentIdOverride || 'none'}, customerId: ${customerId}, customerName: ${customerName}`);

    let slCode = customerDet.SL_CODE ?? bookingDet.SL_CODE ?? pbCustomer.SL_CODE ?? '';
    if (!slCode) {
      if (!customerId) {
        console.error('Voucher: CUSTOMER_ID is empty. Sources checked: bookingDet.CUSTOMER_ID=', bookingDet.CUSTOMER_ID, 'customerDet.CUSTOMER_ID=', customerDet.CUSTOMER_ID, 'lid.CUSTOMER_ID=', lid.CUSTOMER_ID, 'pbCustomer.CUSTOMER_ID=', pbCustomer.CUSTOMER_ID, 'pbEnquiry.CUSTOMER_ID=', pbEnquiry.CUSTOMER_ID);
        return res.status(400).json({
          success: false,
          error: 'CUSTOMER_ID not found. Cannot fetch SL_CODE.',
        });
      }

      try {
        console.log('Fetching SL_CODE for CUSTOMER_ID:', customerId);
        const slResponse = await axios.post(
          'https://www.advantagetvs.in/OnlineSalesWebAPI/Voucher/GetSLCodeByCustomerID',
          {
            DEALER_ID: dealerId,
            Ref_Id: customerId,
            Party_Cat: 'Customer',
          },
          {
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json, text/plain, */*',
              'Origin': 'https://www.advantagetvs.in',
              'Referer': 'https://www.advantagetvs.in/LiteApp/',
            },
            timeout: 30000,
          }
        );

        console.log('GetSLCodeByCustomerID response:', JSON.stringify(slResponse.data, null, 2));
        slCode = slResponse.data?.data?.SL_CODE
          || slResponse.data?.SL_CODE
          || slResponse.data?.data
          || '';

        if (typeof slCode === 'object') {
          slCode = slCode.SL_CODE || '';
        }
      } catch (slError: any) {
        console.error('GetSLCodeByCustomerID failed:', slError.response?.data || slError.message);
        return res.status(400).json({
          success: false,
          error: `Failed to fetch SL_CODE for Customer ID ${customerId}: ${slError.response?.data?.message || slError.message}`,
        });
      }
    }

    if (!slCode) {
      return res.status(400).json({
        success: false,
        error: `SL_CODE not found for Customer ID ${customerId}. Cannot construct voucher.`,
      });
    }

    // Fetch account mapping from TVS for authoritative GL codes (fallback to branch config)
    let glCodeDebit = config.GL_CODE_DEBIT;
    let glCodeCredit = config.GL_CODE_CREDIT;
    let glDescDebit = config.GL_DESC_DEBIT;
    let glDescCredit = config.GL_DESC_CREDIT;
    let bankId: any = null;

    try {
      console.log('Fetching GetAccountMapping...');
      const accMapResponse = await axios.post(
        'https://www.advantagetvs.in/OnlineSalesWebAPI/Voucher/GetAccountMapping',
        {
          DEALER_ID: dealerId,
          COMPANY_ID: config.COMPANY_ID,
          DOC_ID: 1,
          payment_mode_id: config.PAYMENT_MODE_ID,
          VOUCHER_TYPE: config.VCHR_TYPE_ID,
        },
        {
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://www.advantagetvs.in',
            'Referer': 'https://www.advantagetvs.in/LiteApp/',
          },
          timeout: 30000,
        }
      );

      console.log('GetAccountMapping response:', JSON.stringify(accMapResponse.data, null, 2));

      const accMap = accMapResponse.data?.data;
      if (accMap) {
        glCodeDebit = accMap.debit_gl_id || glCodeDebit;
        glCodeCredit = accMap.credit_gl_id || glCodeCredit;
        glDescDebit = accMap.Gen_Desc_Debt || glDescDebit;
        glDescCredit = accMap.Gen_Desc || glDescCredit;
        bankId = accMap.bank_id ?? null;
        console.log(`AccountMapping: Debit GL=${glCodeDebit} (${glDescDebit}), Credit GL=${glCodeCredit} (${glDescCredit}), Bank=${bankId}`);
      }
    } catch (accMapError: any) {
      console.warn('GetAccountMapping failed, using branch config defaults:', accMapError.response?.data || accMapError.message);
    }

    // Ensure GL codes and SL code are numbers to match TVS expected types
    const numGlDebit = Number(glCodeDebit) || 0;
    const numGlCredit = Number(glCodeCredit) || 0;
    const numSlCode = Number(slCode) || 0;
    const numCustomerId = Number(customerId) || 0;

    // Construct voucher request body — all IDs as numbers per TVS reference
    const voucherBody = {
      DEALER_ID: Number(dealerId),
      BRANCH_ID: Number(branchIdExt),
      VOUCHER_ID: 0,
      VOUCHER_NO: 0,
      CREATED_BY: String(config.CREATED_BY),
      VOUCHER_DT: dateStr,
      VCHR_TYPE_ID: Number(config.VCHR_TYPE_ID),
      VCHR_VALUE: amount,
      VCHR_STATUS: 1,
      FIN_YEAR: finYear,
      COMPANY_ID: String(config.COMPANY_ID),
      PAYMENT_MODE_ID: Number(config.PAYMENT_MODE_ID),
      DOCUMENT_ID: documentId,
      DOC_NO: documentId,
      DOC_TYPE: 1,
      DOC_DATE: dateStr,
      ST_DOC_DATE: dateStr,
      BASE_DOC_TYPE: '6',
      PARTY_CODE: String(numCustomerId),
      PARTY_NAME: customerName,
      INSTR_NO: null,
      INSTR_DATE: null,
      INSTR_AMT: null,
      INSTRUMENT_ON: null,
      ACCOUNT_NO: null,
      PARTY_CAT: 1,
      CRED_CARD_TY_ID: null,
      CRED_CARD_EXP_DT: null,
      APPROVAL_NO: null,
      BANK_BRANCH: null,
      BANK_ID: bankId,
      BASE_VOUCHER_ID: null,
      UNRECON_VAL: amount,
      CRED_LMT_TYPE: 1,
      TDS_APPLIED: 'false',
      ACTIVE: 'true',
      VOUCHER_ACC_DETAILS: [
        {
          GL_CODE: numGlDebit,
          SL_CODE: '',
          ACC_VALUE: String(amount),
          CREDIT_LIMIT_TYPE: '1',
          IS_DEBIT: true,
        },
        {
          GL_CODE: numGlCredit,
          SL_CODE: numSlCode,
          ACC_VALUE: String(amount),
          CREDIT_LIMIT_TYPE: '1',
          IS_DEBIT: false,
        },
      ],
      LEDGER_ENTRY_DET: [
        {
          DEALER_ID: String(dealerId),
          BRANCH_ID: String(branchIdExt),
          VOUCHER_DATE: isoDate,
          FIN_YEAR: finYear,
          VOUCHER_SUB_TYPE: Number(config.VCHR_TYPE_ID),
          PARTY_CAT: '1',
          PARTY_CODE: String(numCustomerId),
          VOUCHER_STATUS: '1',
          DOC_ID: documentId,
          payment_mode_id: Number(config.PAYMENT_MODE_ID),
          VOUCHER_TYPE: Number(config.VCHR_TYPE_ID),
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: bankId,
          GL_CODE: numGlDebit,
          Gen_Desc: glDescDebit,
          SL_CODE: '',
          Sub_Desc: '',
          VCHR_VALUE: String(amount),
          IS_DEBIT: true,
        },
        {
          DEALER_ID: String(dealerId),
          BRANCH_ID: String(branchIdExt),
          VOUCHER_DATE: isoDate,
          FIN_YEAR: finYear,
          VOUCHER_SUB_TYPE: Number(config.VCHR_TYPE_ID),
          PARTY_CAT: '1',
          PARTY_CODE: String(numCustomerId),
          VOUCHER_STATUS: '1',
          DOC_ID: documentId,
          payment_mode_id: Number(config.PAYMENT_MODE_ID),
          VOUCHER_TYPE: Number(config.VCHR_TYPE_ID),
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: bankId,
          GL_CODE: numGlCredit,
          Gen_Desc: glDescCredit,
          SL_CODE: numSlCode,
          Sub_Desc: customerName,
          VCHR_VALUE: String(amount),
          IS_DEBIT: false,
        },
      ],
    };

    console.log('Voucher request body:', JSON.stringify(voucherBody, null, 2));

    const voucherApiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Voucher/SaveVoucher';

    const voucherResponse = await axios.post(voucherApiUrl, voucherBody, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.advantagetvs.in',
        'Referer': 'https://www.advantagetvs.in/LiteApp/',
      },
      timeout: 30000,
    });

    // Cache the voucher submission (suffix distinguishes 1st vs 2nd call)
    ensureEnquiryCacheDir();
    const enquiryId = bookingDet.ENQUIRY_ID || bookingDet.ENQUIRY_NO || voucherEnquiryId || lid.ENQUIRY_ID || 'unknown';
    const voucherLabel = documentIdOverride ? 'voucher-2' : 'voucher-1';
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `${voucherLabel}-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      voucherCall: documentIdOverride ? '2nd (BOOKING_NO)' : '1st (BOOK_PART_ID)',
      documentId,
      submittedBy: user.username,
      submittedAt: new Date().toISOString(),
      request: voucherBody,
      response: voucherResponse.data,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: voucherResponse.data,
      voucherBody,
      cachedAs: `${voucherLabel}-${enquiryId}.json`,
    });

  } catch (error: any) {
    console.error('Error in submitVoucher:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to submit voucher' });
  }
};

// ──────────────────────────────────────────────────────────────
// LoadVehicleFrameforAllotment — fetches available chassis numbers
// for dropdown on Vehicle Details tab (post-booking).
// ──────────────────────────────────────────────────────────────
export const loadVehicleFrames = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId, partId: explicitPartId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branch.dealerId || !user.branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    const branch = user.branch;

    // Generate TVS token
    let token: string;
    try {
      token = await generateTVSToken(
        branch.dealerId!,
        branch.externalBranchId!,
        user.externalRoleId!,
        user.externalLoginId!,
        user.externalUserId!,
      );
    } catch (tokenError: any) {
      return res.status(502).json({ success: false, error: `TVS token generation failed: ${tokenError.message}` });
    }

    // Resolve PART_ID — from explicit param, or from pre-booking cache, or from VehicleCatalog
    let partIdResolved = explicitPartId;

    if (!partIdResolved && enquiryId) {
      ensureEnquiryCacheDir();
      const preBookingFile = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
      if (fs.existsSync(preBookingFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(preBookingFile, 'utf-8'));
          const pbData = parsed.response?.data || parsed.response || parsed;
          partIdResolved =
            pbData.BookingPartDetails?.[0]?.PART_ID ||
            pbData.Enquiry?.ENQUIRY_MODEL_LIST?.[0]?.PART_ID ||
            '';
          console.log('LoadVehicleFrames: Resolved PART_ID from cache:', partIdResolved);
        } catch { /* ignore parse errors */ }
      }
    }

    if (!partIdResolved) {
      return res.status(400).json({ success: false, error: 'PART_ID could not be resolved. Provide partId or a valid enquiryId with cached pre-booking data.' });
    }

    // STORAGE_LOC from branch config, default 3
    const branchConfig = await getBranchConfig(branchId);
    const storageLoc = Number(branchConfig.STORAGE_LOC) || 3;

    const requestBody = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      PART_ID: partIdResolved,
      STORAGE_LOC: storageLoc,
    };

    console.log('LoadVehicleFrameforAllotment request:', JSON.stringify(requestBody));

    const apiResponse = await axios.post(
      'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/LoadVehicleFrameforAllotment',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 30000,
      },
    );

    const tvsResp = apiResponse.data;
    console.log('LoadVehicleFrameforAllotment response statusCode:', tvsResp?.statusCode);
    console.log('LoadVehicleFrameforAllotment response top-level keys:', tvsResp ? Object.keys(tvsResp) : 'null');
    console.log('LoadVehicleFrameforAllotment response.data type:', typeof tvsResp?.data);
    console.log('LoadVehicleFrameforAllotment response.data keys:', tvsResp?.data ? Object.keys(tvsResp.data) : 'null/missing');
    if (tvsResp?.data?.VehicleList) {
      console.log('VehicleList length:', tvsResp.data.VehicleList.length);
    } else {
      console.log('VehicleList NOT found at response.data.VehicleList');
      console.log('Full response (first 500 chars):', JSON.stringify(tvsResp).substring(0, 500));
    }

    if (tvsResp.statusCode !== 200) {
      return res.status(502).json({
        success: false,
        error: tvsResp.message || 'TVS API returned an error',
        details: tvsResp,
      });
    }

    const responseData = tvsResp.data || {};
    const vehicleList: any[] = responseData.VehicleList || responseData.vehicleList || [];

    if (vehicleList.length === 0) {
      console.log('VehicleList is empty. responseData keys:', Object.keys(responseData));
      return res.json({ success: true, data: [], count: 0, availableQty: responseData.AvailableQty || 0 });
    }

    // Map VehicleList to dropdown-friendly format using FRAME_NO
    const chassisOptions = vehicleList
      .filter((f: any) => f.FRAME_NO)
      .map((f: any) => ({
        value: f.FRAME_NO,
        label: `${f.FRAME_NO} — ${f.DESCRIPTION || f.MODEL_DESCRIPTION || ''}`.trim(),
        engineNo: f.ENGINE_NO || '',
        vehicleId: f.VEHICLE_ID || 0,
        keyNo: f.KEY_NO || '',
        batteryNo: f.BATTERY_NO || '',
        description: f.DESCRIPTION || '',
        exShowroomPrice: f.EX_SHRM_PRICE || 0,
        grnDate: f.GRN_DATE || '',
        noOfDays: f.NO_OF_DAYS || 0,
      }));

    // Cache response for debugging
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `vehicle-frames-${enquiryId || partIdResolved}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({ request: requestBody, response: apiResponse.data, mapped: chassisOptions }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: chassisOptions,
      count: chassisOptions.length,
      availableQty: responseData.AvailableQty || 0,
      partId: responseData.PartId || partIdResolved,
    });
  } catch (error: any) {
    console.error('Error in loadVehicleFrames:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to load vehicle frames' });
  }
};

// ──────────────────────────────────────────────────────────────
// Perform Allotment — two-step:
//   1. GetHoUnlockPDIDetails (allotment with frame details)
//   2. GetAllLocationOldFrameforAllotment (confirm chassis with PART_ID)
// ──────────────────────────────────────────────────────────────
export const performAllotment = async (req: AuthRequest, res: Response) => {
  try {
    const { frameNumber, vehicleId, noOfDays, engineNo, bookingNo, enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!frameNumber || !vehicleId) {
      return res.status(400).json({ success: false, error: 'Frame number and vehicle ID are required. Select a chassis first.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branch.dealerId || !user.branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    const branch = user.branch;

    let token: string;
    try {
      token = await generateTVSToken(
        branch.dealerId!,
        branch.externalBranchId!,
        user.externalRoleId!,
        user.externalLoginId!,
        user.externalUserId!,
      );
    } catch (tokenError: any) {
      return res.status(502).json({ success: false, error: `TVS token generation failed: ${tokenError.message}` });
    }

    const apiHeaders = {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/plain, */*',
    };

    // ── Step 1: GetHoUnlockPDIDetails ──
    const step1Body = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      Frame_Number: frameNumber,
      VEHICLE_ID: Number(vehicleId),
      NO_OF_DAYS: Number(noOfDays) || 0,
    };

    console.log('Step 1 — GetHoUnlockPDIDetails request:', JSON.stringify(step1Body));

    const step1Resp = await axios.post(
      'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/GetHoUnlockPDIDetails',
      step1Body,
      { headers: apiHeaders, timeout: 30000 },
    );

    console.log('Step 1 — GetHoUnlockPDIDetails response:', JSON.stringify(step1Resp.data));

    // ── Step 2: GetAllLocationOldFrameforAllotment ──
    // Resolve PART_ID from multiple cache sources
    let partIdResolved = '';
    if (enquiryId) {
      ensureEnquiryCacheDir();

      // Source 1: pre-booking cache
      const preBookingFile = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
      if (!partIdResolved && fs.existsSync(preBookingFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(preBookingFile, 'utf-8'));
          const pbData = parsed.response?.data || parsed.response || parsed;
          partIdResolved =
            pbData.BookingPartDetails?.[0]?.PART_ID ||
            pbData.Enquiry?.ENQUIRY_MODEL_LIST?.[0]?.PART_ID ||
            '';
        } catch { /* ignore */ }
      }

      // Source 2: set-line-item cache
      if (!partIdResolved) {
        const sliFile = path.join(ENQUIRY_CACHE_DIR, `set-line-item-${enquiryId}.json`);
        if (fs.existsSync(sliFile)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(sliFile, 'utf-8'));
            partIdResolved = parsed.request?.PART_ID || parsed.response?.data?.[0]?.PART_ID || '';
          } catch { /* ignore */ }
        }
      }

      // Source 3: save-booking cache
      if (!partIdResolved) {
        const sbFile = path.join(ENQUIRY_CACHE_DIR, `save-booking-${enquiryId}.json`);
        if (fs.existsSync(sbFile)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(sbFile, 'utf-8'));
            const sbResp = parsed.response?.data || parsed.response || {};
            const sbDet = sbResp.BookingDet || sbResp;
            partIdResolved = sbDet.BookPartDetailsList?.[0]?.PART_ID || sbDet.PART_ID || '';
          } catch { /* ignore */ }
        }
      }

      console.log('Allotment: partIdResolved =', partIdResolved, 'for enquiryId =', enquiryId);
    }

    let step2Response: any = null;
    if (partIdResolved) {
      const step2Body = {
        DEALER_ID: branch.dealerId,
        BRANCH_ID: branch.externalBranchId,
        PART_ID: partIdResolved,
        STORAGE_LOC: -1,
      };

      console.log('Step 2 — GetAllLocationOldFrameforAllotment request:', JSON.stringify(step2Body));

      try {
        const step2Resp = await axios.post(
          'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/GetAllLocationOldFrameforAllotment',
          step2Body,
          { headers: apiHeaders, timeout: 30000 },
        );
        step2Response = step2Resp.data;
        console.log('Step 2 — GetAllLocationOldFrameforAllotment response statusCode:', step2Response?.statusCode);
      } catch (step2Err: any) {
        console.error('Step 2 — GetAllLocationOldFrameforAllotment error:', step2Err.message);
      }
    } else {
      console.warn('Allotment: PART_ID not resolved from cache, skipping GetAllLocationOldFrame step');
    }

    // ── Step 3: SaveAllotment ──
    // Load pre-booking data for customer/booking details
    let pbData: any = {};
    if (enquiryId) {
      const preBookingFile = path.join(ENQUIRY_CACHE_DIR, `pre-booking-${enquiryId}.json`);
      if (fs.existsSync(preBookingFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(preBookingFile, 'utf-8'));
          pbData = parsed.response?.data || parsed.response || parsed;
        } catch { /* ignore */ }
      }
    }

    // Also load save-booking and search-booking caches as fallback sources for CUSTOMER_ID
    let sbData: any = {};
    let searchBookingData: any = {};
    if (enquiryId) {
      const sbFile = path.join(ENQUIRY_CACHE_DIR, `save-booking-${enquiryId}.json`);
      if (fs.existsSync(sbFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(sbFile, 'utf-8'));
          sbData = parsed.response?.data || parsed.response || {};
        } catch { /* ignore */ }
      }
      // Search-booking cache may be keyed by enquiryId or contactNo
      const searchFile = path.join(ENQUIRY_CACHE_DIR, `search-booking-${enquiryId}.json`);
      if (fs.existsSync(searchFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(searchFile, 'utf-8'));
          const bookingList = parsed.response?.data?.BookingList || [];
          if (bookingList.length > 0) {
            searchBookingData = bookingList.sort((a: any, b: any) =>
              new Date(b.BOOKING_DATE || 0).getTime() - new Date(a.BOOKING_DATE || 0).getTime()
            )[0];
          }
        } catch { /* ignore */ }
      }
    }

    const pbCustomer = pbData.Customer || {};
    const pbEnquiry = pbData.Enquiry || {};
    const pbPart0 = (pbData.BookingPartDetails || [])[0] || {};
    const branchConfig = await getBranchConfig(branchId);
    const storageLoc = Number(branchConfig.STORAGE_LOC) || 3;
    const createdBy = Number(branchConfig.CREATED_BY) || 0;
    const finYear = Number(getIndianFinancialYear());
    const now = new Date();
    const isoNow = now.toISOString();

    const pbBooking = pbData.Booking || {};
    const sbBookingDet = sbData?.BookingDet || sbData || {};

    // Resolve CUSTOMER_ID: pre-booking > save-booking > search-booking > frontend bookingNo fallback
    const customerId = pbCustomer.CUSTOMER_ID || pbEnquiry.CUSTOMER_ID || sbBookingDet.CUSTOMER_ID || searchBookingData.CUSTOMER_ID || 0;
    const endUserId = pbEnquiry.END_USER_ID || sbBookingDet.END_USER_ID || customerId;
    const custName = pbCustomer.CUST_NAME || sbBookingDet.CUSTOMER_NAME || searchBookingData.CUST_NAME || '';
    const customerType = pbCustomer.CUSTOMER_TYPE || searchBookingData.CustomerType || 'Individual';
    console.log('SaveAllotment: CUSTOMER_ID resolution — pbCustomer:', pbCustomer.CUSTOMER_ID, ', pbEnquiry:', pbEnquiry.CUSTOMER_ID, ', sbBookingDet:', sbBookingDet.CUSTOMER_ID, ', searchBooking:', searchBookingData.CUSTOMER_ID, '→ final:', customerId);

    // Resolve BOOKING_ID from pre-booking cache (authoritative), NOT from frontend form field
    const resolvedBookingNo = pbBooking.BOOKING_ID || pbBooking.BOOKING_NO || sbBookingDet.BOOKING_ID || sbBookingDet.BOOKING_NO || searchBookingData.BOOKING_ID || searchBookingData.BOOKING_NO || pbPart0.BOOKING_NO || Number(bookingNo) || 0;
    console.log('SaveAllotment: resolvedBookingNo =', resolvedBookingNo, '(frontend bookingNo =', bookingNo, ', cache Booking.BOOKING_ID =', pbBooking.BOOKING_ID, ', sbBookingDet.BOOKING_ID =', sbBookingDet.BOOKING_ID, ', searchBooking.BOOKING_ID =', searchBookingData.BOOKING_ID, ')');
    const bookPartId = pbPart0.BOOK_PART_ID ?? sbBookingDet.BookPartDetailsList?.[0]?.BOOK_PART_ID ?? 0;
    const bookingValue = pbPart0.TOTAL_AMOUNT ?? pbPart0.EX_SHRM_PRICE ?? 0;
    const bookedQty = pbPart0.BOOKED_QTY ?? 1;
    const custCatId = pbCustomer.CUST_CAT_ID ?? searchBookingData.CUST_TY_ID ?? 1;
    const partDesc = pbPart0.DESCRIPTION || pbPart0.PART_DESC || '';
    const bookingDate = pbData.Booking?.BOOKING_DATE
      ? new Date(pbData.Booking.BOOKING_DATE).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    // Load full raw frame object from vehicle-frames cache for SelectedVehicleList
    let fullFrameObject: any = null;
    const framesCacheFile = path.join(ENQUIRY_CACHE_DIR, `vehicle-frames-${enquiryId || partIdResolved}.json`);
    if (fs.existsSync(framesCacheFile)) {
      try {
        const framesParsed = JSON.parse(fs.readFileSync(framesCacheFile, 'utf-8'));
        const rawResponse = framesParsed.response?.data || framesParsed.response || {};
        const rawData = rawResponse.data || rawResponse;
        const rawVehicleList: any[] = rawData.VehicleList || rawData.vehicleList || [];
        fullFrameObject = rawVehicleList.find((f: any) => f.FRAME_NO === frameNumber) || null;
        console.log('SaveAllotment: full frame object found =', !!fullFrameObject, 'from cache file =', framesCacheFile);
      } catch (e) {
        console.warn('SaveAllotment: failed to read vehicle-frames cache:', e);
      }
    } else {
      console.warn('SaveAllotment: vehicle-frames cache not found at', framesCacheFile);
    }

    // Build SelectedVehicleList: use full raw frame with STORAGE_LOC appended
    const selectedVehicle = fullFrameObject
      ? { ...fullFrameObject, STORAGE_LOC: storageLoc }
      : {
          FRAME_NO: frameNumber,
          ENGINE_NO: engineNo || '',
          VEHICLE_ID: Number(vehicleId),
          PART_ID: partIdResolved || pbPart0.PART_ID || '',
          WARRANTY_BOOKELET_NO: null,
          STORAGE_LOC: storageLoc,
          RECAL_FRAME_MSG: null,
          RECOMMENDED_FRAMENUMBER_STATUS: 'FIFO Recommended',
        };

    const step3Body = {
      IS_ATP_ENABLED: false,
      IS_CALL_ATP_FOR_FRAME_NO_AVAILABILITY: false,
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      IS_EMAP: null,
      AMD_ID: 0,
      BOOKING_ID: resolvedBookingNo,
      ALLOTMENT_DATE: isoNow,
      CUSTOMER_ID: customerId,
      END_USER_ID: endUserId,
      STATUS: 1,
      REMARKS: '',
      INVOICED: false,
      CREATED_BY: createdBy,
      MODIFIED_BY: null,
      FIN_YEAR: finYear,
      CREATED_ON: isoNow,
      AllotedVehicleList: [{
        BOOKING_NO: resolvedBookingNo,
        CUST_NAME: custName,
        CUSTOMER_TYPE: customerType,
        BOOKING_DATE: bookingDate,
        BOOKING_VALUE: bookingValue,
        BOOKED_QTY: bookedQty,
        ALLOTED_QTY: 0,
        PART_DESC: partDesc || fullFrameObject?.DESCRIPTION || '',
        PART_ID: partIdResolved || pbPart0.PART_ID || fullFrameObject?.PART_ID || '',
        CUSTOMER_ID: customerId,
        BOOK_PART_ID: bookPartId,
        CUST_CAT_ID: custCatId,
        STORAGE_LOC: storageLoc,
        VEHICLE_ID: Number(vehicleId),
        VEHICLE_INVOICED: false,
        ACCESS_SEL: false,
        LIKE_DT_OF_REGIS: null,
        ACC_FIT_DATE: null,
        DELIVERY_DATE: null,
      }],
      SelectedVehicleList: [selectedVehicle],
    };

    console.log('Step 3 — SaveAllotment request:', JSON.stringify(step3Body, null, 2));

    let step3Response: any = null;
    try {
      const step3Resp = await axios.post(
        'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SaveAllotment',
        step3Body,
        { headers: apiHeaders, timeout: 30000 },
      );
      step3Response = step3Resp.data;
      console.log('Step 3 — SaveAllotment response:', JSON.stringify(step3Response));
    } catch (step3Err: any) {
      console.error('Step 3 — SaveAllotment error:', step3Err.response?.data || step3Err.message);
      step3Response = { statusCode: 500, error: step3Err.response?.data?.message || step3Err.message };
    }

    // Cache all responses
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `allotment-${enquiryId || frameNumber}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      step1_HoUnlockPDI: { request: step1Body, response: step1Resp.data },
      step2_AllLocationOldFrame: { request: partIdResolved ? { DEALER_ID: branch.dealerId, BRANCH_ID: branch.externalBranchId, PART_ID: partIdResolved, STORAGE_LOC: -1 } : 'skipped', response: step2Response },
      step3_SaveAllotment: { request: step3Body, response: step3Response },
    }, null, 2), 'utf-8');

    const allSuccess = step1Resp.data.statusCode === 200 && (step3Response?.statusCode === 200 || step3Response?.statusCode === undefined);

    if (!allSuccess) {
      return res.status(502).json({
        success: false,
        error: step3Response?.message || step1Resp.data.message || 'Allotment failed',
        step1Status: step1Resp.data.statusCode,
        step2Status: step2Response?.statusCode,
        step3Status: step3Response?.statusCode,
        details: { step1: step1Resp.data, step3: step3Response },
      });
    }

    res.json({
      success: true,
      data: step3Response?.data || step1Resp.data.data,
      message: 'Allotment saved successfully',
      step1Status: step1Resp.data.statusCode,
      step2Status: step2Response?.statusCode,
      step3Status: step3Response?.statusCode,
    });
  } catch (error: any) {
    console.error('Error in performAllotment:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to perform allotment' });
  }
};

// ==================== SAVE BOOKING AFTER ALLOTMENT ====================
// Re-calls SaveBooking with post-allotment modifications (ALLOTED_QTY=1, VEHICLE_ID, ROW_STATE=Modified, etc.)
// Uses cached data from pre-booking, set-line-item, save-booking, allotment, and vehicle-frames.
export const saveBookingAfterAllotment = async (req: AuthRequest, res: Response) => {
  try {
    const { enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!enquiryId) {
      return res.status(400).json({ success: false, error: 'enquiryId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user || !user.branch.dealerId || !user.branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }
    const branch = user.branch;

    let token: string;
    try {
      token = await generateTVSToken(
        branch.dealerId!,
        branch.externalBranchId!,
        user.externalRoleId!,
        user.externalLoginId!,
        user.externalUserId!,
      );
    } catch (tokenError: any) {
      return res.status(502).json({ success: false, error: `TVS token generation failed: ${tokenError.message}` });
    }

    ensureEnquiryCacheDir();

    // ── Load all cached data ──
    const readCache = (filename: string): any => {
      const filePath = path.join(ENQUIRY_CACHE_DIR, filename);
      if (!fs.existsSync(filePath)) return null;
      try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
    };

    const preBookingCache = readCache(`pre-booking-${enquiryId}.json`);
    const setLineItemCache = readCache(`set-line-item-${enquiryId}.json`);
    const saveBookingCache = readCache(`save-booking-${enquiryId}.json`);
    const allotmentCache = readCache(`allotment-${enquiryId}.json`);

    const pbData = preBookingCache?.response?.data || preBookingCache?.response || {};
    const pbCustomer = pbData.Customer || {};
    const pbEnquiry = pbData.Enquiry || {};
    const pbBooking = pbData.Booking || {};
    const pbParts: any[] = pbData.BookingPartDetails || [];
    const pbPart0 = pbParts[0] || {};

    // The original save-booking request is the best base — it already has the full structure
    const originalBookingRequest = saveBookingCache?.request || {};
    // save-booking response for fallback IDs
    const sbResponse = saveBookingCache?.response?.data || saveBookingCache?.response || {};
    const sbDet = sbResponse.BookingDet || sbResponse;
    const sbPart0 = sbDet.BookPartDetailsList?.[0] || {};
    // set-line-item request as fallback base
    const sliRequest = setLineItemCache?.request || {};
    const sliPart0 = sliRequest.BookPartDetailsList?.[0] || {};

    // Search-booking cache for additional fallback
    const searchBookingCache = readCache(`search-booking-${enquiryId}.json`);
    let searchBookingData: any = {};
    if (searchBookingCache) {
      const bookingList = searchBookingCache.response?.data?.BookingList || [];
      if (bookingList.length > 0) {
        searchBookingData = [...bookingList].sort((a: any, b: any) =>
          new Date(b.BOOKING_DATE || 0).getTime() - new Date(a.BOOKING_DATE || 0).getTime()
        )[0];
      }
    }

    const branchConfig = await getBranchConfig(branchId);
    const createdBy = Number(branchConfig.CREATED_BY) || 0;
    const storageLoc = Number(branchConfig.STORAGE_LOC) || 3;
    const finYear = Number(getIndianFinancialYear());
    const today = new Date();
    const bookingDateFormatted = pbBooking.BOOKING_DATE
      ? new Date(pbBooking.BOOKING_DATE).toISOString().split('T')[0]
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const createdOnFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const modifiedOnFormatted = createdOnFormatted;

    // Resolve IDs from allotment response
    const allotmentStep3 = allotmentCache?.step3_SaveAllotment?.response || {};
    const allotmentData = allotmentStep3?.data || allotmentStep3 || {};
    const allotVehId = allotmentData.ALLOT_VEH_ID || allotmentData.AllotmentId || 0;

    // Resolve vehicle ID and frame number from allotment request
    const allotmentStep3Req = allotmentCache?.step3_SaveAllotment?.request || {};
    const allottedVehicle = allotmentStep3Req.SelectedVehicleList?.[0] || {};
    const selectedVehicleId = allottedVehicle.VEHICLE_ID || sbPart0.VEHICLE_ID || pbPart0.VEHICLE_ID || 0;
    const selectedFrameNo = allottedVehicle.FRAME_NO || '';

    // Core booking identifiers — multi-source resolution
    const bookingId = pbBooking.BOOKING_ID || sbDet.BOOKING_ID || originalBookingRequest.BOOKING_ID || searchBookingData.BOOKING_ID || Number(pbPart0.BOOKING_NO) || 0;
    const bookingNo = pbBooking.BOOKING_NO || sbDet.BOOKING_NO || originalBookingRequest.BOOKING_NO || searchBookingData.BOOKING_NO || bookingId;
    const customerId = pbCustomer.CUSTOMER_ID || pbEnquiry.CUSTOMER_ID || sbDet.CUSTOMER_ID || searchBookingData.CUSTOMER_ID || 0;
    const endUserId = pbEnquiry.END_USER_ID || sbDet.END_USER_ID || customerId;
    const refCustId = pbEnquiry.REFERRAL_CUSTOMER_ID || pbBooking.REF_CUST_ID || sbDet.REF_CUST_ID || originalBookingRequest.REF_CUST_ID || 0;
    const salesmanId = pbEnquiry.SALESMAN_ID || pbBooking.SALESMAN_ID || originalBookingRequest.SALESMAN_ID || 1;
    const insTypeId = (pbBooking.INS_TYPE_ID ?? originalBookingRequest.INS_TYPE_ID ?? Number(branchConfig.INS_TYPE_ID)) || 3;
    const insCompId = (pbBooking.INS_COMP_ID ?? originalBookingRequest.INS_COMP_ID ?? Number(branchConfig.INS_COMP_ID)) || 4;
    const rtoId = (pbBooking.RTO_ID ?? originalBookingRequest.RTO_ID ?? Number(branchConfig.RTO_ID)) || 0;
    const regisTypeId = (pbBooking.REGIS_TYPE_ID ?? originalBookingRequest.REGIS_TYPE_ID ?? Number(branchConfig.REG_TYPE_ID)) || 1;
    const enquiryModeId = pbEnquiry.ENQUIRY_MODE_ID || originalBookingRequest.ENQUIRY_MODE_ID || 4;
    const enquiryMode = pbEnquiry.ENQUIRY_MODE || originalBookingRequest.ENQUIRY_MODE || 'Direct marketing';

    // Amounts — pre-booking > save-booking response > original request
    const unitPrice = pbPart0.UNIT_PRICE || pbPart0.EX_SHRM_PRICE || sbPart0.UNIT_PRICE || sbPart0.EX_SHRM_PRICE || 0;
    const taxAmount = pbPart0.TAX_AMOUNT || sbPart0.TAX_AMOUNT || 0;
    const totalAmount = pbPart0.TOTAL_AMOUNT || sbPart0.TOTAL_AMOUNT || (unitPrice + taxAmount);
    const bookingAmt = pbBooking.BOOKING_AMT || originalBookingRequest.BOOKING_AMT || sbDet.BOOKING_AMT || 0;
    const partId = pbPart0.PART_ID || sbPart0.PART_ID || sliPart0.PART_ID || allottedVehicle.PART_ID || '';
    const modelId = pbPart0.MODEL_ID || sbPart0.MODEL_ID || sliPart0.MODEL_ID || allottedVehicle.MODEL_ID || '';
    const partDesc = pbPart0.DESCRIPTION || pbPart0.PART_DESC || sbPart0.PART_DESC || allottedVehicle.DESCRIPTION || '';
    const bookPartId = pbPart0.BOOK_PART_ID || sbPart0.BOOK_PART_ID || 0;

    console.log('SaveBookingAfterAllotment: ALLOT_VEH_ID =', allotVehId, ', bookingId =', bookingId, ', customerId =', customerId, ', partId =', partId, ', modelId =', modelId, ', bookPartId =', bookPartId);

    // Tax lists from pre-booking
    const bookingPartTaxList = pbPart0.BookingPartTaxList || [];
    const bookingTaxList = bookingPartTaxList.map((t: any) => ({
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      BOOK_PART_TAX_ID: t.BOOK_PART_TAX_ID || 0,
      BOOK_PART_ID: bookPartId,
      DESCRIPTION: t.DESCRIPTION || '',
      TAX_PERC: t.TAX_PERC || 0,
      APPLIED_AMT: t.APPLIED_AMT || unitPrice,
      ROW_STATE: t.ROW_STATE || 0,
      TaxValue: t.TaxValue || 0,
      TAX_TYPE_ID: t.TAX_TYPE_ID || 0,
      RUNNING_NO: t.RUNNING_NO || 0,
    }));

    // Build BookPartDetailsList — take full structure from pbPart0 and overlay allotment data
    const bookPartDetails = {
      ...pbPart0,
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      RunningNo: bookPartId,
      BOOK_PART_ID: bookPartId,
      PART_ID: partId,
      MODEL_ID: modelId,
      UNIT_PRICE: unitPrice,
      EX_SHRM_PRICE: unitPrice,
      BOOKED_QTY: pbPart0.BOOKED_QTY || 1,
      ALLOTED_QTY: 1,
      PENDING_QTY: 0,
      TAX_AMOUNT: taxAmount,
      TOTAL_AMOUNT: totalAmount,
      VEHICLE_ID: selectedVehicleId,
      ALLOT_VEH_ID: allotVehId,
      PART_DESC: partDesc,
      DESCRIPTION: null,
      ROW_STATE: 'Modified',
      STATUS: 0,
      ROW_SELECT: true,
      BookingPartTaxList: bookingPartTaxList,
      BookingSchemeList: pbPart0.BookingSchemeList || [],
      AppVehicleSchemeList: pbPart0.AppVehicleSchemeList || [],
      SelectedVehicleSchemeList: pbPart0.SelectedVehicleSchemeList || null,
      AccessoryList: pbPart0.AccessoryList || null,
      AllotmentList: pbPart0.AllotmentList || null,
      SERIES: pbPart0.SERIES || null,
      IS_EV_VEH: pbPart0.IS_EV_VEH || false,
      VEHICLE_SCH_ID: pbPart0.VEHICLE_SCH_ID || null,
      ApplicableTax: pbPart0.ApplicableTax || null,
      AccInvDetails: pbPart0.AccInvDetails || null,
    };

    // ModelPart — from set-line-item cache or pre-booking
    if (sliRequest.BookPartDetailsList?.[0]?.ModelPart) {
      bookPartDetails.ModelPart = sliRequest.BookPartDetailsList[0].ModelPart;
    } else if (pbPart0.ModelPart) {
      bookPartDetails.ModelPart = pbPart0.ModelPart;
    }

    // modelPartList — from set-line-item cache or pre-booking
    if (sliRequest.BookPartDetailsList?.[0]?.modelPartList) {
      bookPartDetails.modelPartList = sliRequest.BookPartDetailsList[0].modelPartList;
    } else if (pbPart0.modelPartList) {
      bookPartDetails.modelPartList = pbPart0.modelPartList;
    }

    // Ref customer name — from save-booking response, pre-booking, or original request
    const refCustName = sbDet.RefCustName || pbBooking.RefCustName || originalBookingRequest.RefCustName || pbEnquiry.REFERRAL_CUSTOMER_NAME || '';

    // OpenValueList from save-booking response, original request, or pre-booking
    const openValueList = sbDet.OpenValueList || originalBookingRequest.OpenValueList || pbData.OpenValueList || [{
      DEALER_ID: 0, BRANCH_ID: 0, OPEN_VALUE_ID: 0,
      COMPANY_ID: Number(branchConfig.COMPANY_ID) || 19904,
      COMPANY_NAME: refCustName || '',
      DOC_NO: null, DOC_DATE: null, DOC_TYPE: 0,
      PAR_DOC_NO: null, PAR_DOC_TYPE: null, PAR_DOC_DATE: null,
      OPEN_VALUE: 0, IsParentDoc: false, CREDIT_LIMIT_DAYS: 0,
      CUSTOMER_ID: null, ADVANCE_UTILISED: 0, ADVANCE_UN_UTILISED: 0, ADVANCE_AMOUNT: 0,
    }];

    const saveBookingBody = {
      BOOKING_SOURCE_DESC: pbBooking.BOOKING_SOURCE_DESC || null,
      BOOKING_SOURCE_ID: pbBooking.BOOKING_SOURCE_ID || 0,
      IS_FULL_PAYMENT_RECEIVED: pbBooking.IS_FULL_PAYMENT_RECEIVED || false,
      FULL_PAYMENT_DATE: pbBooking.FULL_PAYMENT_DATE || null,
      FULL_PAYMENT_RECEIVED_BY_NAME: pbBooking.FULL_PAYMENT_RECEIVED_BY_NAME || null,
      AccInvDetails: null,
      is_quick_booking: 0,
      INVOICE_ID: pbBooking.INVOICE_ID || 0,
      DEALER_ID: branch.dealerId,
      PART_ID: null,
      MODEL_ID: null,
      FRAME_NO: null,
      BRANCH_ID: branch.externalBranchId,
      BOOKING_ID: bookingId,
      BOOKING_NO: bookingNo,
      BOOKING_DATE: bookingDateFormatted,
      RefCustName: refCustName,
      BOOKING_TYPE: pbBooking.BOOKING_TYPE ?? false,
      ENQUIRY_ID: Number(enquiryId),
      ENQUIRY_NO: Number(enquiryId),
      QUOTATION_ID: pbBooking.QUOTATION_ID || null,
      CUSTOMER_ID: customerId,
      END_USER_ID: endUserId,
      FOLLOWUP_ENQ: pbBooking.FOLLOWUP_ENQ ?? false,
      SALESMAN_ID: salesmanId,
      CUST_MNG_INSR: pbBooking.CUST_MNG_INSR ?? false,
      INS_TYPE_ID: insTypeId,
      INS_COMP_ID: insCompId,
      INSR_CNOTE_GIVEN: pbBooking.INSR_CNOTE_GIVEN ?? false,
      CUST_MNGD_REG: pbBooking.CUST_MNGD_REG ?? false,
      RTO_ID: rtoId,
      REGIS_TYPE_ID: regisTypeId,
      DEL_WOUT_REG: pbBooking.DEL_WOUT_REG ?? false,
      DLR_DEL_DATE: pbBooking.DLR_DEL_DATE || '',
      CUST_DEL_DATE: pbBooking.CUST_DEL_DATE || '',
      HpDocList: pbBooking.HpDocList || [],
      BookingTaxList: bookingTaxList,
      DISC_VALUE: pbBooking.DISC_VALUE || null,
      TOT_ACC_CHRGS: pbBooking.TOT_ACC_CHRGS ?? originalBookingRequest.TOT_ACC_CHRGS ?? 0,
      TOT_REG_CHRGS: pbBooking.TOT_REG_CHRGS ?? originalBookingRequest.TOT_REG_CHRGS ?? 0,
      TOT_AMT_PAID: pbBooking.TOT_AMT_PAID || null,
      TOT_AMT_DUE: totalAmount,
      TOT_AMT_PNDG: totalAmount,
      COMMENTS: pbBooking.COMMENTS || null,
      SPL_REG_REQ: pbBooking.SPL_REG_REQ || null,
      SLF_ARNGD_HP: pbBooking.SLF_ARNGD_HP ?? false,
      REASON_ID: pbBooking.REASON_ID || null,
      REMARKS: pbBooking.REMARKS || null,
      IS_FORMC: pbBooking.IS_FORMC ?? false,
      COMM_PAID: pbBooking.COMM_PAID ?? false,
      BULK_INVOICE_ID: pbBooking.BULK_INVOICE_ID || null,
      STATUS: 1,
      CREATED_BY: createdBy,
      CREATED_ON: createdOnFormatted,
      MODIFIED_BY: createdBy,
      MODIFIED_ON: modifiedOnFormatted,
      ACTIVE: true,
      ExchangeCompanyId: pbBooking.ExchangeCompanyId || null,
      REF_CUST_ID: refCustId,
      BookingPartList: null,
      CustomerDetails: null,
      EndUserDetails: null,
      BookPartDetailsList: [bookPartDetails],
      ExchangeBookList: pbBooking.ExchangeBookList || originalBookingRequest.ExchangeBookList || [],
      BookHPDetails: pbBooking.BookHPDetails || null,
      SelfHPDetails: pbBooking.SelfHPDetails || null,
      Voucher: pbBooking.Voucher || null,
      ROW_STATE: 'Modified',
      BookingExchangePart: pbBooking.BookingExchangePart || null,
      VehicleInvoiceList: pbBooking.VehicleInvoiceList || originalBookingRequest.VehicleInvoiceList || [],
      VehicleAllotment: pbBooking.VehicleAllotment || null,
      AllotmentDetilList: pbBooking.AllotmentDetilList || null,
      Type: 0,
      FIN_YEAR: finYear,
      SL_CODE: pbCustomer.SL_CODE || 0,
      QUOTATION_NO: pbBooking.QUOTATION_NO || '',
      RefCustomerType: sbDet.RefCustomerType || pbEnquiry.RefCustomerType || originalBookingRequest.RefCustomerType || 'IndirectASC',
      REF_CUST_TY_ID: sbDet.REF_CUST_TY_ID ?? pbBooking.REF_CUST_TY_ID ?? 0,
      IS_THRU_MULTI_INVOICE: pbBooking.IS_THRU_MULTI_INVOICE ?? false,
      OpenValueList: openValueList,
      INTERNET_ENQUIRY_ID: pbEnquiry.INTERNET_ENQUIRY_ID || 0,
      INTERNET_ENQUIRY_ID_S: pbEnquiry.INTERNET_ENQUIRY_ID_S || null,
      BOOK_AMT: pbBooking.BOOK_AMT || null,
      ENQUIRY_MODE: enquiryMode,
      ENQUIRY_MODE_ID: enquiryModeId,
      COUNTRY_CODE: branchConfig.DealerCountry || branch.countryCode || 'IN',
      Acceptance: pbBooking.Acceptance || null,
      IS_THRU_ANGULAR: pbBooking.IS_THRU_ANGULAR || null,
      PART_CHANGED_FROM_INET: pbBooking.PART_CHANGED_FROM_INET || null,
      UPDATED_AFTER_CHANGE: pbBooking.UPDATED_AFTER_CHANGE || null,
      IS_EMS: pbBooking.IS_EMS || null,
      STATE_ID: branchConfig.DealerState || pbBooking.STATE_ID || 'TG',
      BOOKING_AMT: bookingAmt,
      IS_BOOKING_ACKNOWLEDGED: pbBooking.IS_BOOKING_ACKNOWLEDGED ?? false,
      BOOKING_FOLLOWUP_STATUS: pbBooking.BOOKING_FOLLOWUP_STATUS || null,
      VehicleArrivalDetails: pbBooking.VehicleArrivalDetails || null,
      IS_ATP_ENABLED: false,
      AMD_Accept: pbBooking.AMD_Accept ?? false,
      AD_BOOKING_ID: pbBooking.AD_BOOKING_ID || 0,
      Ad_DealerId: pbBooking.Ad_DealerId || 0,
      PERMIT_STATUS: pbBooking.PERMIT_STATUS || null,
      VEHICLE_USER: pbBooking.VEHICLE_USER || null,
      REFERRAL_CUSTOMER_NAME: sbDet.REFERRAL_CUSTOMER_NAME || pbEnquiry.REFERRAL_CUSTOMER_NAME || null,
      REFERRAL_CUSTOMER_TYPE: sbDet.REFERRAL_CUSTOMER_TYPE || pbEnquiry.REFERRAL_CUSTOMER_TYPE || null,
      REFERRAL_CUSTOMER_MOBILE_NUMBER: sbDet.REFERRAL_CUSTOMER_MOBILE_NUMBER || pbEnquiry.REFERRAL_CUSTOMER_MOBILE_NUMBER || null,
      RefCustomerTypeId: sbDet.RefCustomerTypeId ?? pbEnquiry.RefCustomerTypeId ?? pbBooking.RefCustomerTypeId ?? 3,
      Is_TRV: false,
      TM_APPROVE_STATUS: 0,
      Is_EMAIL_SENT: false,
      IS_SERIES_RESTRICTION_ENABLED: false,
      BOOKING_TYPE_DESC: pbBooking.BOOKING_TYPE_DESC || 'Single',
      STATUS_DESC: 'Alloted',
      CUSTOMER_NAME: pbCustomer.CUST_NAME || sbDet.CUSTOMER_NAME || searchBookingData.CUST_NAME || '',
      CUSTOMER_TYPE: pbCustomer.CUSTOMER_TYPE || sbDet.CUSTOMER_TYPE || searchBookingData.CustomerType || 'Individual',
      TOT_UNIT_PRICE: unitPrice,
      TOT_LINE_DISC: pbBooking.TOT_LINE_DISC ?? originalBookingRequest.TOT_LINE_DISC ?? 0,
      TOT_TAX_VAL: taxAmount,
      TOT_SUB_TOT1: totalAmount,
      TOT_SUB_TOT2: totalAmount,
      TOT_BILL_DISC: pbBooking.TOT_BILL_DISC ?? 0,
      TOT_ADV_AMT: pbBooking.TOT_ADV_AMT ?? 0,
      TOT_RFND_AMT: pbBooking.TOT_RFND_AMT ?? 0,
      QUOTATION_DATE: pbBooking.QUOTATION_DATE || '',
      ENQUIRY_DATE: pbEnquiry.ENQUIRY_DATE || '',
      END_USER: null,
    };

    console.log('SaveBookingAfterAllotment request:', JSON.stringify(saveBookingBody, null, 2));

    const apiResponse = await axios.post(
      'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SaveBooking',
      saveBookingBody,
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 30000,
      },
    );

    console.log('SaveBookingAfterAllotment response status:', apiResponse.status);

    // Cache the response
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `save-booking-after-allotment-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      savedBy: user.username,
      savedAt: new Date().toISOString(),
      request: saveBookingBody,
      response: apiResponse.data,
    }, null, 2), 'utf-8');

    const respData = apiResponse.data;
    if (respData.statusCode && respData.statusCode !== 200) {
      return res.status(502).json({
        success: false,
        error: respData.message || 'SaveBooking after allotment failed',
        details: respData,
      });
    }

    res.json({
      success: true,
      data: respData.data || respData,
      message: 'Booking saved after allotment successfully',
    });

  } catch (error: any) {
    console.error('Error in saveBookingAfterAllotment:', error);
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to save booking after allotment' });
  }
};

// ── SearchBooking — fetch booked details by phone number ──
export const searchBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { contactNo, enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!contactNo) {
      return res.status(400).json({ success: false, error: 'contactNo (phone number) is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branch.dealerId || !user.branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    const branch = user.branch;

    let token: string;
    try {
      token = await generateTVSToken(
        branch.dealerId!,
        branch.externalBranchId!,
        user.externalRoleId!,
        user.externalLoginId!,
        user.externalUserId!,
      );
    } catch (tokenError: any) {
      return res.status(502).json({ success: false, error: `TVS token generation failed: ${tokenError.message}` });
    }

    // Date range: 90 days back to 7 days ahead
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90);
    fromDate.setHours(5, 30, 0, 0);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);
    toDate.setHours(5, 30, 0, 0);

    const requestBody = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      BOOKING_DATE_FROM: fromDate.toISOString(),
      BOOKING_DATE_TO: toDate.toISOString(),
      BOOKING_ID: null,
      CUST_NAME: null,
      CONTACT_NO: String(contactNo),
      COMBINE_ENQUIRYMODE_ID: '',
    };

    console.log('SearchBooking request:', JSON.stringify(requestBody));

    const apiResponse = await axios.post(
      'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SearchBooking',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 30000,
      },
    );

    const responseData = apiResponse.data?.data || apiResponse.data || {};
    const bookingList: any[] = responseData.BookingList || [];

    console.log('SearchBooking: found', bookingList.length, 'booking(s)');

    // Cache the response
    ensureEnquiryCacheDir();
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `search-booking-${enquiryId || contactNo}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      contactNo,
      enquiryId,
      request: requestBody,
      response: apiResponse.data,
      fetchedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    if (bookingList.length === 0) {
      return res.json({ success: true, data: null, message: 'No bookings found for this phone number.' });
    }

    // Use the latest booking (sort by BOOKING_DATE desc, take first)
    const sorted = [...bookingList].sort((a, b) => {
      const da = new Date(a.BOOKING_DATE || 0).getTime();
      const db = new Date(b.BOOKING_DATE || 0).getTime();
      return db - da;
    });
    const latest = sorted[0];

    res.json({
      success: true,
      data: {
        bookingId: latest.BOOKING_ID || latest.BOOKING_NO || 0,
        bookingNo: latest.BOOKING_NO || latest.BOOKING_ID || 0,
        customerId: latest.CUSTOMER_ID || 0,
        customerName: latest.CUST_NAME || '',
        enquiryId: latest.ENQUIRY_ID || latest.ENQUIRY_NO || 0,
        enquiryNo: latest.ENQUIRY_NO || latest.ENQUIRY_ID || 0,
        statusDesc: latest.STATUS_DESC || '',
        model: latest.MODEL || '',
        color: latest.COLOR || '',
        mobileNo: latest.MOBILE_NO || contactNo,
        allotmentId: latest.Allotment_Id || 0,
        bookingDate: latest.BOOKING_DATE || '',
        bookedQty: latest.BOOKED_QTY || 0,
        totalCount: bookingList.length,
        raw: latest,
      },
      message: bookingList.length > 1
        ? `Found ${bookingList.length} bookings. Using the latest one (${latest.BOOKING_NO}).`
        : 'Booking details fetched successfully.',
    });
  } catch (error: any) {
    console.error('SearchBooking error:', error?.response?.data || error.message);
    if (error.response?.status) {
      return res.status(error.response.status).json({
        success: false,
        error: `TVS API error (${error.response.status}): ${JSON.stringify(error.response.data?.message || error.response.data || 'Unknown error')}`,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to search bookings' });
  }
};

// ── FormatVehicleModel template (captured by Playwright) ──

/** Called by perform-booking.mjs after intercepting TVS FormatVehicleModel POST. No JWT — uses sync key. */
export const syncFormatVehicleTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const syncKey = req.headers['x-automation-sync-key'];
    const expected = process.env.AUTOMATION_SYNC_KEY || 'crm-automation-sync';
    if (syncKey !== expected) {
      return res.status(403).json({ success: false, error: 'Invalid automation sync key' });
    }

    const { payload, enquiryNo, url, capturedAt } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'payload object is required' });
    }

    const record = {
      capturedAt: capturedAt || new Date().toISOString(),
      enquiryNo: enquiryNo ? String(enquiryNo) : undefined,
      url: url ? String(url) : FORMAT_VEHICLE_API_URL,
      payload: payload as Record<string, unknown>,
    };
    saveFormatVehicleTemplateRecord(record);

    console.log('FormatVehicleModel template synced from automation', {
      enquiryNo: record.enquiryNo,
      capturedAt: record.capturedAt,
    });

    res.json({ success: true, message: 'FormatVehicleModel template saved', capturedAt: record.capturedAt });
  } catch (error: any) {
    console.error('syncFormatVehicleTemplate error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to save template' });
  }
};

export const getFormatVehicleTemplateStatus = async (_req: AuthRequest, res: Response) => {
  const record = loadFormatVehicleTemplateRecord();
  res.json({
    success: true,
    hasTemplate: !!record?.payload,
    capturedAt: record?.capturedAt || null,
    enquiryNo: record?.enquiryNo || null,
  });
};

/** FormatVehicleModel — load TVS catalog (groups → Model) or submodels for a group (→ SubModel). */
export const formatVehicleModel = async (req: AuthRequest, res: Response) => {
  try {
    const { action, group, enquiryId } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const templateRecord = loadFormatVehicleTemplateRecord();
    if (!templateRecord?.payload) {
      return res.status(404).json({
        success: false,
        error: 'No FormatVehicleModel template yet. Run Perform Booking automation once to capture the TVS payload.',
        hasTemplate: false,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user || !user.branch.dealerId || !user.branch.externalBranchId) {
      return res.status(400).json({ success: false, error: 'Branch API credentials not configured' });
    }

    let token: string;
    try {
      token = await generateTVSToken(
        user.branch.dealerId!,
        user.branch.externalBranchId!,
        user.externalRoleId!,
        user.externalLoginId!,
        user.externalUserId || 0
      );
    } catch (tokenError: any) {
      return res.status(502).json({ success: false, error: `TVS token generation failed: ${tokenError.message}` });
    }

    const requestBody = mergeFormatVehiclePayload(templateRecord.payload, {
      enquiryId: enquiryId ? String(enquiryId) : undefined,
    });

    let tvsResponse = loadFormatVehicleResponse();

    if (action === 'load' || !tvsResponse) {
      console.log('FormatVehicleModel request (load catalog):', JSON.stringify(requestBody));
      tvsResponse = await callFormatVehicleModelApi(token, requestBody);
      saveFormatVehicleResponse(tvsResponse);
    }

    if (action === 'load') {
      const groups = parseFormatVehicleGroups(tvsResponse);
      return res.json({
        success: true,
        data: { groups },
        templateCapturedAt: templateRecord.capturedAt,
        message: groups.length
          ? `Loaded ${groups.length} TVS model group(s)`
          : 'TVS returned no model groups',
      });
    }

    if (group) {
      if (!tvsResponse) {
        tvsResponse = await callFormatVehicleModelApi(token, requestBody);
        saveFormatVehicleResponse(tvsResponse);
      }
      const submodels = parseFormatVehicleSubModelsForGroup(tvsResponse, String(group));
      return res.json({
        success: true,
        data: { submodels },
        templateCapturedAt: templateRecord.capturedAt,
        message: submodels.length
          ? `Found ${submodels.length} sub-model(s) in ${group}`
          : `No sub-models found for group ${group}`,
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Provide action: "load" to fetch groups, or group: "<name>" for submodels',
    });
  } catch (error: any) {
    console.error('formatVehicleModel error:', error?.response?.data || error.message);
    if (error.response?.status) {
      return res.status(error.response.status).json({
        success: false,
        error: `TVS API error (${error.response.status}): ${JSON.stringify(error.response.data?.message || error.response.data || 'Unknown error')}`,
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to format vehicle model' });
  }
};
