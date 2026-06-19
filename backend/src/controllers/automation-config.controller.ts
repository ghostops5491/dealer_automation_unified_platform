import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types';
import { prisma } from '../lib/prisma';

export const AUTOMATION_CONFIG_KEYS = [
  'TVS_AUTOMATION_USER_ID',
  'TVS_AUTOMATION_PASSWORD',
] as const;

export type AutomationConfigKey = (typeof AUTOMATION_CONFIG_KEYS)[number];

export interface BranchAutomationCredentials {
  userId: string | null;
  password: string | null;
}

/** Load TVS Playwright login credentials stored on a branch (BranchField). */
export async function getBranchAutomationCredentials(
  branchId: string
): Promise<BranchAutomationCredentials> {
  const fields = await prisma.branchField.findMany({
    where: {
      branchId,
      fieldName: { in: [...AUTOMATION_CONFIG_KEYS] },
    },
  });

  const userId =
    fields.find((f) => f.fieldName === 'TVS_AUTOMATION_USER_ID')?.fieldValue || null;
  const password =
    fields.find((f) => f.fieldName === 'TVS_AUTOMATION_PASSWORD')?.fieldValue || null;

  return { userId, password };
}

export const getAutomationConfig = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id: branchId } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      res.status(404).json({ success: false, error: 'Branch not found' });
      return;
    }

    const creds = await getBranchAutomationCredentials(branchId);

    res.json({
      success: true,
      data: {
        dealerId: branch.dealerId,
        TVS_AUTOMATION_USER_ID: creds.userId || '',
        TVS_AUTOMATION_PASSWORD: creds.password || '',
      },
    });
  } catch (error) {
    console.error('Get automation config error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch automation config' });
  }
};

export const updateAutomationConfig = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id: branchId } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      res.status(404).json({ success: false, error: 'Branch not found' });
      return;
    }

    const updates = req.body as Record<string, string>;
    const results: Array<{ fieldName: string; fieldValue: string }> = [];

    for (const key of AUTOMATION_CONFIG_KEYS) {
      if (updates[key] === undefined) continue;
      const value = String(updates[key]).trim();
      if (!value) continue;

      const field = await prisma.branchField.upsert({
        where: { branchId_fieldName: { branchId, fieldName: key } },
        update: { fieldValue: value },
        create: { branchId, fieldName: key, fieldValue: value },
      });
      results.push({ fieldName: field.fieldName, fieldValue: field.fieldValue });
    }

    res.json({
      success: true,
      message: `Updated ${results.length} automation field(s)`,
      data: results.map((r) => ({
        fieldName: r.fieldName,
        configured: true,
      })),
    });
  } catch (error) {
    console.error('Update automation config error:', error);
    res.status(500).json({ success: false, error: 'Failed to update automation config' });
  }
};
