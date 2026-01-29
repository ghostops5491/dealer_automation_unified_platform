import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types';
import { prisma } from '../lib/prisma';
import { FormSubmission, FormHistory, User, Flow } from '@prisma/client';

// Get history for a specific submission
export const getSubmissionHistory = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { submissionId } = req.params;

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Verify user has access to this submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        flow: true,
        user: {
          select: { id: true, firstName: true, lastName: true, username: true }
        }
      }
    });

    if (!submission) {
      res.status(404).json({ success: false, error: 'Submission not found' });
      return;
    }

    // Check access - user must be from same branch or superadmin
    if (req.user.type === 'user' && req.user.branchId !== submission.branchId) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const history = await prisma.formHistory.findMany({
      where: { submissionId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, username: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: {
        submission: {
          id: submission.id,
          flowName: submission.flow.name,
          status: submission.status,
          createdBy: submission.user,
          createdAt: submission.createdAt,
          submittedAt: submission.submittedAt
        },
        history
      }
    });
  } catch (error) {
    console.error('Error fetching submission history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
};

// Get all form history for the current user's branch
export const getBranchHistory = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user || req.user.type !== 'user') {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { branchId, role } = req.user;
    const { page = '1', limit = '20', status, flowId } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where: any = { branchId };
    
    if (status) {
      where.status = status;
    }
    
    if (flowId) {
      where.flowId = flowId;
    }

    // Associates can only see their own submissions
    if (role === 'ASSOCIATE') {
      where.userId = req.user.id;
    }

    const [submissions, total] = await Promise.all([
      prisma.formSubmission.findMany({
        where,
        include: {
          flow: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, firstName: true, lastName: true, username: true } },
          history: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              user: { select: { firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.formSubmission.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        submissions: submissions.map((sub: any) => ({
          ...sub,
          lastActivity: sub.history[0] || null
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching branch history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
};

// Get analytics/statistics
export const getAnalytics = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user || req.user.type !== 'user') {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { branchId, role, id: userId } = req.user;
    const { period = 'month' } = req.query; // day, week, month, quarter, year

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let groupBy: 'day' | 'week' | 'month' = 'day';

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        groupBy = 'day';
        break;
      case 'week':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 84); // 12 weeks
        groupBy = 'week';
        break;
      case 'month':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        groupBy = 'month';
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear() - 2, 0, 1);
        groupBy = 'month';
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 5, 0, 1);
        groupBy = 'month';
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        groupBy = 'day';
    }

    // Build filter based on role
    const where: any = {
      branchId,
      createdAt: { gte: startDate }
    };

    // Associates can only see their own data
    if (role === 'ASSOCIATE') {
      where.userId = userId;
    }

    // Get submissions
    const submissions = await prisma.formSubmission.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        submittedAt: true
      }
    });

    // Calculate summary stats
    const summary = {
      total: submissions.length,
      draft: submissions.filter((s: any) => s.status === 'DRAFT').length,
      pending: submissions.filter((s: any) => s.status === 'PENDING_APPROVAL').length,
      approved: submissions.filter((s: any) => s.status === 'APPROVED').length,
      rejected: submissions.filter((s: any) => s.status === 'REJECTED').length
    };

    // Group submissions by time period for chart
    const chartData = generateChartData(submissions, startDate, now, groupBy);

    // Get recent activity
    const recentHistory = await prisma.formHistory.findMany({
      where: {
        submission: where
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
        submission: {
          select: {
            id: true,
            flow: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        summary,
        chartData,
        recentActivity: recentHistory,
        period,
        dateRange: {
          start: startDate,
          end: now
        }
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

// Helper function to generate chart data
function generateChartData(
  submissions: { id: string; status: string; createdAt: Date; submittedAt: Date | null }[],
  startDate: Date,
  endDate: Date,
  groupBy: 'day' | 'week' | 'month'
): { label: string; draft: number; submitted: number; approved: number; rejected: number }[] {
  const data: Map<string, { draft: number; submitted: number; approved: number; rejected: number }> = new Map();

  // Initialize all periods with zero values
  const current = new Date(startDate);
  while (current <= endDate) {
    const label = getDateLabel(current, groupBy);
    if (!data.has(label)) {
      data.set(label, { draft: 0, submitted: 0, approved: 0, rejected: 0 });
    }
    
    if (groupBy === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (groupBy === 'week') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  // Count submissions by period
  for (const sub of submissions) {
    const label = getDateLabel(new Date(sub.createdAt), groupBy);
    const entry = data.get(label);
    if (entry) {
      switch (sub.status) {
        case 'DRAFT':
          entry.draft++;
          break;
        case 'PENDING_APPROVAL':
          entry.submitted++;
          break;
        case 'APPROVED':
          entry.approved++;
          break;
        case 'REJECTED':
          entry.rejected++;
          break;
      }
    }
  }

  // Convert to array and sort
  return Array.from(data.entries())
    .map(([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getDateLabel(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (groupBy) {
    case 'day':
      return `${year}-${month}-${day}`;
    case 'week':
      // Get ISO week number
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 4 - (d.getDay() || 7));
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    case 'month':
      return `${year}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

// Helper to record history (used by form controller)
export const recordFormHistory = async (
  submissionId: string,
  userId: string,
  actionType: 'CREATED' | 'TAB_SAVED' | 'SUBMITTED' | 'SUBMITTED_TO_INSURANCE' | 'INSURANCE_APPROVED' | 'INSURANCE_REJECTED' | 'SUBMITTED_TO_MANAGER' | 'APPROVED' | 'REJECTED' | 'RESUBMITTED' | 'UPDATED',
  options?: {
    tabIndex?: number;
    tabName?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }
) => {
  try {
    await prisma.formHistory.create({
      data: {
        submissionId,
        userId,
        actionType,
        tabIndex: options?.tabIndex,
        tabName: options?.tabName,
        details: options?.details || undefined,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent
      }
    });
  } catch (error) {
    console.error('Error recording form history:', error);
    // Don't throw - history recording shouldn't break the main operation
  }
};

