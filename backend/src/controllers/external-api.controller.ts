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

    // Check if ALL results are already booked
    const allBooked = enquiryList.every((e: TVSEnquiry) => (e.Booked ?? 0) === 1);
    if (allBooked && enquiryList.length === 1) {
      const enquiry = enquiryList[0];
      return res.status(409).json({
        success: false,
        error: mobileNumber
          ? `Mobile number found but order is already booked (Enquiry #${enquiry.ENQUIRY_NO} - ${enquiry.CUST_NAME}).`
          : `Enquiry #${enquiry.ENQUIRY_NO} is already booked (${enquiry.CUST_NAME}).`,
        alreadyBooked: true,
        enquiryNo: enquiry.ENQUIRY_NO,
        customerName: enquiry.CUST_NAME,
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

    // Single result - map and return
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
    const comStateId = findField('COM_STATE_ID');
    if (customerId !== undefined) mappedFields['vehicle_details.customer_id'] = String(customerId);
    if (modelId !== undefined) mappedFields['vehicle_details.model_id'] = String(modelId);
    if (comStateId !== undefined) mappedFields['vehicle_details.rto_state'] = String(comStateId);

    // Amounts & Tax fields
    const unitPrice = findField('UNIT_PRICE');
    const exShrmPrice = findField('EX_SHRM_PRICE');
    const taxAmount = findField('TAX_AMOUNT');
    const totalAmount = findField('TOTAL_AMOUNT');
    const bookedQty = findField('BOOKED_QTY');
    const pendingQty = findField('PENDING_QTY');

    if (unitPrice !== undefined) mappedFields['amounts_tax.base_amount'] = unitPrice;
    if (exShrmPrice !== undefined) mappedFields['amounts_tax.ex_showroom_price'] = exShrmPrice;
    if (taxAmount !== undefined) mappedFields['amounts_tax.tax_amount'] = taxAmount;
    if (totalAmount !== undefined) mappedFields['amounts_tax.total_amount'] = totalAmount;
    if (bookedQty !== undefined) mappedFields['amounts_tax.booked_qty'] = bookedQty;
    if (pendingQty !== undefined) mappedFields['amounts_tax.pending_qty'] = pendingQty;

    // Extract CGST and SGST from tax details array
    const cgst = taxDetails.find((t: any) =>
      t.DESCRIPTION === 'CGST' || t.TAX_TYPE === 'CGST' || t.TAX_NAME?.includes('CGST') || t.TaxType === 'CGST' || t.TaxName?.includes('CGST')
    );
    const sgst = taxDetails.find((t: any) =>
      t.DESCRIPTION === 'SGST' || t.TAX_TYPE === 'SGST' || t.TAX_NAME?.includes('SGST') || t.TaxType === 'SGST' || t.TaxName?.includes('SGST')
    );

    if (cgst) {
      const perc = cgst.TAX_PERC ?? cgst.TAX_PERCENTAGE ?? cgst.TaxPerc ?? cgst.TaxPercentage ?? 0;
      const applied = cgst.APPLIED_AMT ?? cgst.APPLIED_AMOUNT ?? cgst.AppliedAmt ?? cgst.AppliedAmount ?? 0;
      const taxVal = cgst.TaxValue ?? cgst.TAX_VALUE ?? cgst.TAX_AMOUNT ?? cgst.TaxAmount ?? 0;
      mappedFields['amounts_tax.cgst_line'] = `CGST = ${perc}% on ${applied} = ${taxVal}`;
      mappedFields['_cgst_perc'] = perc;
      mappedFields['_cgst_applied'] = applied;
      mappedFields['_cgst_value'] = taxVal;
    }

    if (sgst) {
      const perc = sgst.TAX_PERC ?? sgst.TAX_PERCENTAGE ?? sgst.TaxPerc ?? sgst.TaxPercentage ?? 0;
      const applied = sgst.APPLIED_AMT ?? sgst.APPLIED_AMOUNT ?? sgst.AppliedAmt ?? sgst.AppliedAmount ?? 0;
      const taxVal = sgst.TaxValue ?? sgst.TAX_VALUE ?? sgst.TAX_AMOUNT ?? sgst.TaxAmount ?? 0;
      mappedFields['amounts_tax.sgst_line'] = `SGST = ${perc}% on ${applied} = ${taxVal}`;
      mappedFields['_sgst_perc'] = perc;
      mappedFields['_sgst_applied'] = applied;
      mappedFields['_sgst_value'] = taxVal;
    }

    console.log('Pre-booking mappedFields:', JSON.stringify(mappedFields, null, 2));

    res.json({
      success: true,
      data: rawData,
      mappedFields,
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

    // Build the request body
    const requestBody = {
      DEALER_ID: branch.dealerId,
      BRANCH_ID: branch.externalBranchId,
      ENQUIRY_ID: Number(enquiryId),
      AMD_CODE: 0,
      LocationID: 0,
      IS_EMAP: null,
      DealerCountry: pbConfig.DealerCountry || branch.countryCode || 'IN',
      DealerState: pbConfig.DealerState || 'TG',
      REG_TYPE_ID: pbConfig.REG_TYPE_ID,
      INS_COMP_ID: pbConfig.INS_COMP_ID,
      INS_TYPE_ID: pbConfig.INS_TYPE_ID,
      RTO_ID: pbConfig.RTO_ID,
      RunningNo: runningNo,
      SALE_MODE: pbConfig.SALE_MODE || 4,
      CUSTOMER_ID: customerId,
      IsModPartChanged: true,
      ModelId: catalogEntry.modelId || '',
      PartId: catalogEntry.partId || '',
      BookingPartList: [
        {
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
          ROW_STATE: 0,
          VEHICLE_ID: 0,
          STATUS: 0,
          ALLOT_VEH_ID: null,
          PART_DESC: null,
          BookingPartTaxList: [
            {
              DEALER_ID: branch.dealerId,
              BRANCH_ID: branch.externalBranchId,
              BOOK_PART_TAX_ID: 0,
              BOOK_PART_ID: runningNo,
              DESCRIPTION: 'CGST',
              TAX_PERC: cgstPerc,
              APPLIED_AMT: unitPrice,
              ROW_STATE: 0,
              TaxValue: cgstValue,
              TAX_TYPE_ID: 12,
              RUNNING_NO: 0,
            },
            {
              DEALER_ID: branch.dealerId,
              BRANCH_ID: branch.externalBranchId,
              BOOK_PART_TAX_ID: 0,
              BOOK_PART_ID: runningNo,
              DESCRIPTION: 'SGST',
              TAX_PERC: sgstPerc,
              APPLIED_AMT: unitPrice,
              ROW_STATE: 0,
              TaxValue: sgstValue,
              TAX_TYPE_ID: 11,
              RUNNING_NO: 0,
            },
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
        },
      ],
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

    // Cache the response
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `set-line-item-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      partId,
      modelId: catalogEntry.modelId,
      setBy: user.username,
      setAt: new Date().toISOString(),
      request: requestBody,
      response: apiResponse.data,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: apiResponse.data,
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

    // Determine enquiry ID
    const enquiryId = reqEnquiryId || bookingData?.ENQUIRY_ID || bookingData?.ENQUIRY_NO || 'unknown';

    // Load pre-booking cache to get the base booking data
    ensureEnquiryCacheDir();
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

    // Build the final booking request
    // Priority: lineItemData (authoritative from TVS) > pre-booking cache > bookingData (frontend confirmed values)
    let finalBookingData: any;

    if (!preBookingData && !bookingData) {
      return res.status(400).json({ success: false, error: 'No booking data available. Please fetch pre-booking first.' });
    }

    // Start with pre-booking base (from GetPreBooking API response)
    const base = preBookingData || {};

    // Apply user-confirmed values from the modal
    const confirmedAmt = bookingData?.BOOKING_AMT || 0;
    const confirmedTotUnitPrice = bookingData?.TOT_UNIT_PRICE ?? base.TOT_UNIT_PRICE ?? 0;
    const confirmedAccChrgs = bookingData?.TOT_ACC_CHRGS ?? base.TOT_ACC_CHRGS ?? 0;
    const confirmedRegChrgs = bookingData?.TOT_REG_CHRGS ?? base.TOT_REG_CHRGS ?? 0;
    const confirmedLineDisc = bookingData?.TOT_LINE_DISC ?? base.TOT_LINE_DISC ?? 0;
    const confirmedInsCharges = bookingData?.INS_CHARGES ?? base.INS_CHARGES ?? 0;

    // Merge line item data into BookingPartDetails
    const partDetails = lineItemData
      ? [lineItemData]
      : base.BookingPartDetails || base.BookPartDetailsList || [];

    finalBookingData = {
      ...base,
      BOOKING_AMT: confirmedAmt,
      TOT_UNIT_PRICE: confirmedTotUnitPrice,
      TOT_ACC_CHRGS: confirmedAccChrgs,
      TOT_REG_CHRGS: confirmedRegChrgs,
      TOT_LINE_DISC: confirmedLineDisc,
      INS_CHARGES: confirmedInsCharges,
      BookingPartDetails: partDetails,
    };

    console.log('SaveBooking: Merged payload with confirmed values from modal');

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
        } catch (e) {
          console.warn('Failed to read pre-booking cache for voucher:', e);
        }
      }
    }

    // Navigate into nested response: { BookingDet: {...}, Customer: {...} }
    const bookingDet = saveBookingResponse?.BookingDet || saveBookingResponse || {};
    const customerDet = saveBookingResponse?.Customer || {};
    const lid = lineItemData || {};
    const pb = preBookingCache || {};
    const dealerId = bookingDet.DEALER_ID || lid.DEALER_ID || branch.dealerId;
    const branchIdExt = bookingDet.BRANCH_ID || lid.BRANCH_ID || branch.externalBranchId;
    const customerName = customerDet.CUST_NAME || bookingDet.CUSTOMER_NAME || bookingDet.PARTY_NAME || pb.CUSTOMER_NAME || '';
    const customerId = bookingDet.CUSTOMER_ID || customerDet.CUSTOMER_ID || lid.CUSTOMER_ID || pb.CUSTOMER_ID || '';
    const bookPartId = bookingDet.BookPartDetailsList?.[0]?.BOOK_PART_ID || bookingDet.BOOK_PART_ID || lid.BOOK_PART_ID || 0;
    const amount = Number(bookingAmount);

    // documentIdOverride allows the 2nd voucher call to use BOOKING_NO instead of BOOK_PART_ID
    const documentId = documentIdOverride || bookPartId;

    console.log(`Voucher [${documentIdOverride ? '2nd call - BOOKING_NO' : '1st call - BOOK_PART_ID'}] — documentId: ${documentId}, bookPartId: ${bookPartId}, override: ${documentIdOverride || 'none'}`);

    // Use Customer.SL_CODE from SaveBooking response first, then BookingDet.SL_CODE, then API fallback
    let slCode = customerDet.SL_CODE || bookingDet.SL_CODE || '';
    if (!slCode) {
      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'CUSTOMER_ID not found in SaveBooking response. Cannot fetch SL_CODE.',
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

    // Construct voucher request body
    const voucherBody = {
      DEALER_ID: dealerId,
      BRANCH_ID: branchIdExt,
      VOUCHER_ID: 0,
      VOUCHER_NO: 0,
      CREATED_BY: String(config.CREATED_BY),
      VOUCHER_DT: dateStr,
      VCHR_TYPE_ID: config.VCHR_TYPE_ID,
      VCHR_VALUE: amount,
      VCHR_STATUS: 1,
      FIN_YEAR: finYear,
      COMPANY_ID: String(config.COMPANY_ID),
      PAYMENT_MODE_ID: config.PAYMENT_MODE_ID,
      DOCUMENT_ID: documentId,
      DOC_NO: documentId,
      DOC_TYPE: 1,
      DOC_DATE: dateStr,
      ST_DOC_DATE: dateStr,
      BASE_DOC_TYPE: '6',
      PARTY_CODE: String(customerId),
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
          GL_CODE: glCodeDebit,
          SL_CODE: '',
          ACC_VALUE: String(amount),
          CREDIT_LIMIT_TYPE: '1',
          IS_DEBIT: true,
        },
        {
          GL_CODE: glCodeCredit,
          SL_CODE: slCode,
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
          VOUCHER_SUB_TYPE: config.VCHR_TYPE_ID,
          PARTY_CAT: '1',
          PARTY_CODE: String(customerId),
          VOUCHER_STATUS: '1',
          DOC_ID: documentId,
          payment_mode_id: config.PAYMENT_MODE_ID,
          VOUCHER_TYPE: config.VCHR_TYPE_ID,
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: bankId,
          GL_CODE: glCodeDebit,
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
          VOUCHER_SUB_TYPE: config.VCHR_TYPE_ID,
          PARTY_CAT: '1',
          PARTY_CODE: String(customerId),
          VOUCHER_STATUS: '1',
          DOC_ID: documentId,
          payment_mode_id: config.PAYMENT_MODE_ID,
          VOUCHER_TYPE: config.VCHR_TYPE_ID,
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: bankId,
          GL_CODE: glCodeCredit,
          Gen_Desc: glDescCredit,
          SL_CODE: slCode,
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
