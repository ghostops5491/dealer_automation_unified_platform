import { Response } from 'express';
import axios from 'axios';
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
}

// Store tokens in memory with expiration (simple cache)
const tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();

// Map TVS API response to CRM form fields
// Note: Field names must match exactly with the screen field names defined in seed.ts
function mapTVSResponseToCRM(enquiry: TVSEnquiry): Record<string, any> {
  // Parse customer name into first and last name
  const fullName = enquiry.CUST_NAME?.trim() || '';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  return {
    // Customer Enquiry screen fields (matching seed.ts field names)
    'customer_enquiry.enquiry_no': enquiry.ENQUIRY_NO?.toString() || '',
    'customer_enquiry.first_name': firstName,
    'customer_enquiry.last_name': lastName,
    'customer_enquiry.mobile_no': enquiry.CONTACT_NO || '',
    'customer_enquiry.ownership_type': enquiry.CUST_TYPE?.toLowerCase() || 'individual',
    'customer_enquiry.executive_name': enquiry.SALES_PERSON?.trim() || '',
    
    // Vehicle Details screen fields
    'vehicle_details.model': enquiry.MODEL || '',
    
    // Amounts & Tax screen fields
    'amounts_tax.payment_mode': mapPaymentMode(enquiry.SALE_MODE_DESCRIPTION),
    
    // Additional metadata (won't be displayed but useful for tracking)
    '_source': 'TVS_API',
    '_fetched_at': new Date().toISOString(),
    '_enquiry_id': enquiry.ENQUIRY_ID?.toString() || '',
    '_customer_id': enquiry.CUSTOMER_ID?.toString() || '',
    '_status': enquiry.STATUS_DESC || '',
    '_enquiry_date': enquiry.ENQUIRY_DATE?.split('T')[0] || ''
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
          date: e.ENQUIRY_DATE
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
