import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types';
import { prisma } from '../lib/prisma';

// Pre-Booking config keys (used by SelectedEnquiryByID + SetBookingLineItem)
const PRE_BOOKING_CONFIG_KEYS = [
  'INS_COMP_ID',
  'INS_TYPE_ID',
  'REG_TYPE_ID',
  'RTO_ID',
  'DealerCountry',
  'DealerState',
  'SALE_MODE',
];

const PRE_BOOKING_DEFAULTS: Record<string, string> = {
  INS_COMP_ID: '4',
  INS_TYPE_ID: '3',
  REG_TYPE_ID: '1',
  RTO_ID: '142713',
  DealerCountry: 'IN',
  DealerState: 'TG',
  SALE_MODE: '4',
};

// Voucher/Booking config keys (used by SaveBooking + Voucher submission)
const VOUCHER_CONFIG_KEYS = [
  'COMPANY_ID',
  'CREATED_BY',
  'GL_CODE_DEBIT',
  'GL_CODE_CREDIT',
  'GL_DESC_DEBIT',
  'GL_DESC_CREDIT',
  'VCHR_TYPE_ID',
  'PAYMENT_MODE_ID',
];

const VOUCHER_DEFAULTS: Record<string, string> = {
  COMPANY_ID: '19904',
  CREATED_BY: '266550',
  GL_CODE_DEBIT: '11700001',
  GL_CODE_CREDIT: '11600001',
  GL_DESC_DEBIT: 'CASH ACCOUNT',
  GL_DESC_CREDIT: 'VEHICLE CUSTOMER',
  VCHR_TYPE_ID: '101',
  PAYMENT_MODE_ID: '1',
};

// All config keys combined
const ALL_CONFIG_KEYS = [...PRE_BOOKING_CONFIG_KEYS, ...VOUCHER_CONFIG_KEYS];
const ALL_DEFAULTS: Record<string, string> = { ...PRE_BOOKING_DEFAULTS, ...VOUCHER_DEFAULTS };

// --- Helpers exported for use by other controllers ---

export function getIndianFinancialYear(date?: Date): string {
  const d = date || new Date();
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  // Indian FY: April (4) to March (3). If Jan-Mar → FY = previous year
  return String(month >= 4 ? year : year - 1);
}

export async function getBranchConfig(branchId: string): Promise<Record<string, any>> {
  const fields = await prisma.branchField.findMany({
    where: {
      branchId,
      fieldName: { in: ALL_CONFIG_KEYS },
    },
  });
  const config: Record<string, any> = {};
  for (const [key, val] of Object.entries(ALL_DEFAULTS)) {
    const override = fields.find(f => f.fieldName === key);
    const raw = override ? override.fieldValue : val;
    config[key] = isNaN(Number(raw)) ? raw : Number(raw);
  }
  return config;
}

// --- Route handlers ---

export const getPreBookingConfig = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID not found' });
      return;
    }

    const fields = await prisma.branchField.findMany({
      where: {
        branchId,
        fieldName: { in: ALL_CONFIG_KEYS },
      },
    });

    const config: Record<string, string> = { ...ALL_DEFAULTS };
    for (const field of fields) {
      config[field.fieldName] = field.fieldValue;
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Get pre-booking config error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
  }
};

export const updatePreBookingConfig = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID not found' });
      return;
    }

    const updates: Record<string, string> = req.body;
    const results: Array<{ fieldName: string; fieldValue: string }> = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!ALL_CONFIG_KEYS.includes(key)) continue;

      const field = await prisma.branchField.upsert({
        where: { branchId_fieldName: { branchId, fieldName: key } },
        update: { fieldValue: String(value) },
        create: { branchId, fieldName: key, fieldValue: String(value) },
      });
      results.push({ fieldName: field.fieldName, fieldValue: field.fieldValue });
    }

    res.json({
      success: true,
      message: `Updated ${results.length} config fields`,
      data: results,
    });
  } catch (error) {
    console.error('Update pre-booking config error:', error);
    res.status(500).json({ success: false, error: 'Failed to update config' });
  }
};
