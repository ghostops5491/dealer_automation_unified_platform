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
        return res.status(401).json({
          success: false,
          error: `Token generation failed: ${tokenError.message}`,
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
      return res.status(404).json({
        success: false,
        error: 'No enquiry found with the provided details'
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
      rawData: enquiry // Include raw data for reference
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
        // Clear cached token on auth error
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired authorization token. Token will be regenerated on next request.'
        });
      }
      return res.status(error.response?.status || 500).json({
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
        return res.status(401).json({
          success: false,
          error: `Token generation failed: ${tokenError.message}`
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
        return res.status(401).json({ success: false, error: 'Invalid or expired token. Will regenerate on next request.' });
      }
      return res.status(error.response?.status || 500).json({
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
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      return res.status(error.response?.status || 500).json({
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
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      return res.status(error.response?.status || 500).json({
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

    // Parse each part's DESCRIPTION to extract Brand, Model, Variant
    const catalogEntries: Array<{
      brand: string;
      model: string;
      variant: string;
      partId: string;
      modelId: string;
    }> = [];

    for (const part of parts) {
      const description = (part.DESCRIPTION || part.Description || '').trim();
      const partIdVal = part.PART_ID || part.PartId || part.partId || '';
      const modelIdVal = part.MODEL_ID || part.ModelId || modelId;

      if (!description || !partIdVal) continue;

      // Parse: "TVS JUPITER-OBDIIB DISC NEP(CBU) GLC.COP"
      // Brand = first word ("TVS"), Model = second word before space/hyphen ("JUPITER")
      const words = description.split(/[\s]+/);
      const brand = words[0] || 'TVS';
      // Second token: split on hyphen to get the model name
      const secondToken = words[1] || '';
      const modelName = secondToken.split('-')[0] || secondToken;

      catalogEntries.push({
        brand,
        model: modelName,
        variant: description,
        partId: String(partIdVal),
        modelId: String(modelIdVal),
      });
    }

    if (catalogEntries.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not parse any model parts from the response' });
    }

    // Upsert into VehicleCatalog — no duplicates by branchId + partId
    let inserted = 0;
    let skipped = 0;

    for (const entry of catalogEntries) {
      const existing = await prisma.vehicleCatalog.findFirst({
        where: { branchId, partId: entry.partId },
      });

      if (existing) {
        skipped++;
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
          colour: '',
          fuelType: '',
        },
      });
      inserted++;
    }

    console.log(`VehicleCatalog: inserted ${inserted}, skipped ${skipped} (already exist)`);

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
        skipped,
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

// ==================== SAVE BOOKING ====================
// Calls TVS SaveBooking API and returns the response (which includes SL_CODE, BOOKING_AMT, etc.)
export const saveBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { bookingData } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!bookingData) {
      return res.status(400).json({ success: false, error: 'bookingData is required' });
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

    const apiUrl = 'https://www.advantagetvs.in/OnlineSalesWebAPI/Sales/SaveBooking';

    console.log('SaveBooking request:', JSON.stringify(bookingData, null, 2));

    const response = await axios.post(apiUrl, bookingData, {
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
    ensureEnquiryCacheDir();
    const enquiryId = bookingData.ENQUIRY_ID || bookingData.ENQUIRY_NO || 'unknown';
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `save-booking-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      savedBy: user.username,
      savedAt: new Date().toISOString(),
      request: bookingData,
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
// Constructs and submits voucher using SaveBooking response data + branch config
export const submitVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const { saveBookingResponse, bookingAmount } = req.body;
    const userId = req.user?.id;
    const branchId = req.user?.branchId;

    if (!userId || !branchId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!saveBookingResponse || !bookingAmount) {
      return res.status(400).json({ success: false, error: 'saveBookingResponse and bookingAmount are required' });
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

    // Extract data from SaveBooking response
    const sbr = saveBookingResponse;
    const dealerId = sbr.DEALER_ID || branch.dealerId;
    const branchIdExt = sbr.BRANCH_ID || branch.externalBranchId;
    const customerName = sbr.CUSTOMER_NAME || sbr.PARTY_NAME || '';
    const customerId = sbr.CUSTOMER_ID || '';
    const slCode = sbr.SL_CODE || '';
    const bookPartId = sbr.BookPartDetailsList?.[0]?.BOOK_PART_ID || sbr.BOOK_PART_ID || 0;
    const amount = Number(bookingAmount);

    if (!slCode) {
      return res.status(400).json({
        success: false,
        error: 'SL_CODE not found in SaveBooking response. Cannot construct voucher.',
      });
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
      DOCUMENT_ID: bookPartId,
      DOC_NO: bookPartId,
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
      BANK_ID: null,
      BASE_VOUCHER_ID: null,
      UNRECON_VAL: amount,
      CRED_LMT_TYPE: 1,
      TDS_APPLIED: 'false',
      ACTIVE: 'true',
      VOUCHER_ACC_DETAILS: [
        {
          GL_CODE: config.GL_CODE_DEBIT,
          SL_CODE: '',
          ACC_VALUE: String(amount),
          CREDIT_LIMIT_TYPE: '1',
          IS_DEBIT: true,
        },
        {
          GL_CODE: config.GL_CODE_CREDIT,
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
          DOC_ID: bookPartId,
          payment_mode_id: config.PAYMENT_MODE_ID,
          VOUCHER_TYPE: config.VCHR_TYPE_ID,
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: null,
          GL_CODE: config.GL_CODE_DEBIT,
          Gen_Desc: config.GL_DESC_DEBIT,
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
          DOC_ID: bookPartId,
          payment_mode_id: config.PAYMENT_MODE_ID,
          VOUCHER_TYPE: config.VCHR_TYPE_ID,
          COMPANY_ID: String(config.COMPANY_ID),
          bank_id: null,
          GL_CODE: config.GL_CODE_CREDIT,
          Gen_Desc: config.GL_DESC_CREDIT,
          SL_CODE: slCode,
          Sub_Desc: customerName,
          VCHR_VALUE: String(amount),
          IS_DEBIT: false,
        },
      ],
    };

    console.log('Voucher request body:', JSON.stringify(voucherBody, null, 2));

    // TODO: Replace with actual voucher API URL when confirmed
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

    // Cache the voucher submission
    ensureEnquiryCacheDir();
    const enquiryId = sbr.ENQUIRY_ID || sbr.ENQUIRY_NO || 'unknown';
    const cacheFile = path.join(ENQUIRY_CACHE_DIR, `voucher-${enquiryId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({
      enquiryId: String(enquiryId),
      submittedBy: user.username,
      submittedAt: new Date().toISOString(),
      request: voucherBody,
      response: voucherResponse.data,
    }, null, 2), 'utf-8');

    res.json({
      success: true,
      data: voucherResponse.data,
      voucherBody,
      cachedAs: `voucher-${enquiryId}.json`,
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
