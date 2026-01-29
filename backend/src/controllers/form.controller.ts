import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, SaveFormDataDto, ApprovalActionDto } from '../types';
import { SubmissionStatus, UserRole } from '@prisma/client';
import { recordFormHistory } from './history.controller';

// Get all submissions (for superadmin or managers)
export const getAllSubmissions = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { status, flowId, branchId, userId } = req.query;

    const where: any = {};
    
    if (status) where.status = status as SubmissionStatus;
    if (flowId) where.flowId = flowId as string;
    if (branchId) where.branchId = branchId as string;
    if (userId) where.userId = userId as string;

    // If user is not superadmin, filter by their branch
    if (req.user?.type === 'user') {
      where.branchId = req.user.branchId;
      
      // Managers and Insurance Executives see all branch submissions
      // Associates/Viewers see only their own
      const canViewAll = req.user.role === 'MANAGER' || req.user.role === 'INSURANCE_EXECUTIVE';
      if (!canViewAll) {
        where.userId = req.user.id;
      }
    }

    const submissions = await prisma.formSubmission.findMany({
      where,
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: true,
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: {
          include: {
            organization: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        approvals: {
          include: {
            manager: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: submissions,
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get single submission
export const getSubmissionById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  include: {
                    fields: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: {
          include: {
            organization: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        approvals: {
          include: {
            manager: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    // Check access
    if (req.user?.type === 'user') {
      if (submission.branchId !== req.user.branchId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }
      
      // Managers and Insurance Executives can see all branch submissions
      // Others can only see their own submissions
      const canViewAll = req.user.role === 'MANAGER' || req.user.role === 'INSURANCE_EXECUTIVE';
      if (!canViewAll && submission.userId !== req.user.id) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Start a new form submission
export const startSubmission = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user || req.user.type !== 'user') {
      res.status(403).json({
        success: false,
        error: 'Only users can start submissions',
      });
      return;
    }

    const { flowId } = req.body;

    // Verify flow is assigned to user's branch and accessible
    const assignment = await prisma.flowAssignment.findFirst({
      where: {
        flowId,
        branchId: req.user.branchId,
      },
    });

    if (!assignment) {
      res.status(403).json({
        success: false,
        error: 'Flow not available for your branch',
      });
      return;
    }

    // Check role access
    const roleAccessMap: Record<UserRole, keyof typeof assignment> = {
      MANAGER: 'accessibleByManager',
      ASSOCIATE: 'accessibleByAssociate',
      VIEWER: 'accessibleByViewer',
      INSURANCE_EXECUTIVE: 'accessibleByAssociate', // Insurance executives have similar access as associates
    };

    if (!assignment[roleAccessMap[req.user.role!]]) {
      res.status(403).json({
        success: false,
        error: 'You do not have access to this flow',
      });
      return;
    }

    // Create new submission
    const submission = await prisma.formSubmission.create({
      data: {
        flowId,
        branchId: req.user.branchId!,
        userId: req.user.id,
        status: 'DRAFT',
        currentTabIndex: 0,
        formData: {},
      },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  include: {
                    fields: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
      },
    });

    // Record history
    await recordFormHistory(submission.id, req.user.id, 'CREATED', {
      details: { flowName: submission.flow.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: submission,
      message: 'Submission started successfully',
    });
  } catch (error) {
    console.error('Start submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Save form data for a tab
export const saveTabData = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { tabIndex, data } = req.body as { tabIndex: number; data: Record<string, any> };

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  include: {
                    fields: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: true,
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    // Check if user can edit
    if (req.user?.type === 'user') {
      // Insurance Executive can edit insurance_nominee_demographics screen when submission is pending insurance approval
      const isInsuranceExecutive = req.user.role === 'INSURANCE_EXECUTIVE';
      const currentScreen = submission.flow.flowScreens[tabIndex]?.screen;
      const isInsuranceScreen = currentScreen?.code === 'insurance_nominee_demographics';
      const isInsuranceExecutiveEditing = isInsuranceExecutive && isInsuranceScreen && 
        (submission.status === 'PENDING_INSURANCE_APPROVAL' || submission.status === 'PENDING_APPROVAL');

      if (!isInsuranceExecutiveEditing && submission.userId !== req.user.id && req.user.role !== 'MANAGER') {
        res.status(403).json({
          success: false,
          error: 'You can only edit your own submissions',
        });
        return;
      }

      // Viewers cannot edit
      if (req.user.role === 'VIEWER') {
        res.status(403).json({
          success: false,
          error: 'Viewers cannot edit submissions',
        });
        return;
      }
    }

    // Can only edit draft or rejected submissions (or insurance screen when pending insurance approval)
    const isInsuranceExecutive = req.user?.role === 'INSURANCE_EXECUTIVE';
    const currentScreen = submission.flow.flowScreens[tabIndex]?.screen;
    const isInsuranceScreen = currentScreen?.code === 'insurance_nominee_demographics';
    const canInsuranceExecutiveEdit = isInsuranceExecutive && isInsuranceScreen &&
      (submission.status === 'PENDING_INSURANCE_APPROVAL' || submission.status === 'PENDING_APPROVAL');

    if (submission.status !== 'DRAFT' && submission.status !== 'REJECTED' && !canInsuranceExecutiveEdit) {
      res.status(400).json({
        success: false,
        error: 'Cannot edit submission in current status',
      });
      return;
    }

    // Validate that we're not skipping tabs
    if (tabIndex > submission.currentTabIndex + 1) {
      res.status(400).json({
        success: false,
        error: 'Please complete previous tabs first',
      });
      return;
    }

    // Validate fields
    const flowScreen = submission.flow.flowScreens[tabIndex];
    if (!flowScreen) {
      res.status(400).json({
        success: false,
        error: 'Invalid tab index',
      });
      return;
    }

    const validationErrors: string[] = [];
    const existingFormData = submission.formData as Record<string, any>;
    
    // Helper function to check if a field is visible based on conditional logic
    const isFieldVisible = (field: any): boolean => {
      if (!field.conditionalField || !field.conditionalValue) {
        return true; // No conditional logic, always visible
      }
      
      let fieldValue: string | undefined;
      
      // Check if it's a cross-screen reference (contains a dot)
      if (field.conditionalField.includes('.')) {
        const [refScreenCode, fieldName] = field.conditionalField.split('.');
        // Look up the value from existing formData - case-insensitive lookup
        const formDataKey = Object.keys(existingFormData).find(
          key => key.toLowerCase() === refScreenCode.toLowerCase()
        );
        if (formDataKey) {
          fieldValue = existingFormData[formDataKey]?.[fieldName]?.toString()?.toLowerCase();
        }
      } else {
        // Same screen reference - check in current data being saved
        fieldValue = data[field.conditionalField]?.toString()?.toLowerCase();
      }
      
      // Check if the field value matches any of the conditional values (comma-separated)
      const allowedValues = field.conditionalValue.split(',').map((v: string) => v.trim().toLowerCase());
      return !!fieldValue && allowedValues.includes(fieldValue);
    };
    
    for (const field of flowScreen.screen.fields) {
      // Skip validation for fields that are not visible due to conditional logic
      if (!isFieldVisible(field)) {
        continue;
      }
      
      const value = data[field.name];
      
      // Check required
      if (field.isRequired && (value === undefined || value === null || value === '')) {
        validationErrors.push(`${field.label} is required`);
        continue;
      }

      // Skip validation if value is empty and not required
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // Check regex validation
      if (field.validationRegex) {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(String(value))) {
          validationErrors.push(field.validationMessage || `${field.label} is invalid`);
        }
      }

      // Check min/max length for strings
      if (typeof value === 'string') {
        if (field.minLength && value.length < field.minLength) {
          validationErrors.push(`${field.label} must be at least ${field.minLength} characters`);
        }
        if (field.maxLength && value.length > field.maxLength) {
          validationErrors.push(`${field.label} must be at most ${field.maxLength} characters`);
        }
      }

      // Check min/max value for numbers
      if (typeof value === 'number') {
        if (field.minValue !== null && value < field.minValue) {
          validationErrors.push(`${field.label} must be at least ${field.minValue}`);
        }
        if (field.maxValue !== null && value > field.maxValue) {
          validationErrors.push(`${field.label} must be at most ${field.maxValue}`);
        }
      }
    }

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        data: validationErrors,
      });
      return;
    }

    // Merge data
    const existingData = submission.formData as Record<string, any>;
    const screenCode = flowScreen.screen.code;
    const newFormData = {
      ...existingData,
      [screenCode]: data,
    };

    // Update submission
    const updatedSubmission = await prisma.formSubmission.update({
      where: { id },
      data: {
        formData: newFormData,
        currentTabIndex: Math.max(submission.currentTabIndex, tabIndex),
      },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  include: {
                    fields: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
      },
    });

    // Record history
    if (req.user) {
      await recordFormHistory(id, req.user.id, 'TAB_SAVED', {
        tabIndex,
        tabName: flowScreen.tabName,
        details: { screenCode, fieldCount: Object.keys(data).length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    res.json({
      success: true,
      data: updatedSubmission,
      message: 'Data saved successfully',
    });
  } catch (error) {
    console.error('Save tab data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Submit form for approval
export const submitForApproval = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                    isPostApproval: true,
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: true,
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    // Check ownership
    if (req.user?.type === 'user' && submission.userId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'You can only submit your own forms',
      });
      return;
    }

    // Count non-post-approval tabs
    const nonPostApprovalTabs = submission.flow.flowScreens.filter(fs => !fs.screen.isPostApproval);
    const totalRequiredTabs = nonPostApprovalTabs.length;
    
    // Find the last non-post-approval tab index
    let lastRequiredTabIndex = -1;
    submission.flow.flowScreens.forEach((fs, idx) => {
      if (!fs.screen.isPostApproval) {
        lastRequiredTabIndex = idx;
      }
    });
    
    if (submission.currentTabIndex < lastRequiredTabIndex) {
      res.status(400).json({
        success: false,
        error: 'Please complete all required tabs before submitting',
      });
      return;
    }

    // Check if ANY screen in the flow requires insurance approval
    const screensRequiringInsuranceApproval = submission.flow.flowScreens
      .filter(fs => fs.screen.requiresInsuranceApproval)
      .map(fs => ({
        screenId: fs.screen.id,
        screenName: fs.screen.name,
        screenCode: fs.screen.code,
        tabName: fs.tabName,
        tabOrder: fs.tabOrder,
      }));

    // Check if ANY screen in the flow requires manager approval
    const screensRequiringManagerApproval = submission.flow.flowScreens
      .filter(fs => fs.screen.requiresApproval)
      .map(fs => ({
        screenId: fs.screen.id,
        screenName: fs.screen.name,
        screenCode: fs.screen.code,
        tabName: fs.tabName,
        tabOrder: fs.tabOrder,
      }));

    const requiresInsuranceApproval = screensRequiringInsuranceApproval.length > 0;
    const requiresManagerApproval = screensRequiringManagerApproval.length > 0;
    
    // Determine the status based on approval requirements
    let newStatus: SubmissionStatus;
    if (requiresInsuranceApproval) {
      newStatus = 'PENDING_INSURANCE_APPROVAL';
    } else if (requiresManagerApproval) {
      newStatus = 'PENDING_MANAGER_APPROVAL';
    } else {
      newStatus = 'APPROVED';
    }

    const updatedSubmission = await prisma.formSubmission.update({
      where: { id },
      data: {
        status: newStatus,
        submittedAt: new Date(),
        // If no insurance approval required, set as N/A
        ...((!requiresInsuranceApproval) && { insuranceApprovalStatus: 'N/A' }),
      },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Record history
    if (req.user) {
      const isResubmit = submission.status === 'REJECTED';
      let actionType: any = isResubmit ? 'RESUBMITTED' : 'SUBMITTED';
      if (requiresInsuranceApproval) {
        actionType = 'SUBMITTED_TO_INSURANCE';
      } else if (requiresManagerApproval) {
        actionType = 'SUBMITTED_TO_MANAGER';
      }
      
      await recordFormHistory(id, req.user.id, actionType, {
        details: { 
          requiresInsuranceApproval,
          requiresManagerApproval,
          screensRequiringInsuranceApproval: screensRequiringInsuranceApproval.map(s => s.screenName),
          screensRequiringManagerApproval: screensRequiringManagerApproval.map(s => s.screenName),
          status: newStatus
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    let message = 'Form submitted and approved successfully';
    if (requiresInsuranceApproval) {
      message = `Form submitted for Insurance Executive approval (${screensRequiringInsuranceApproval.length} screen(s))`;
    } else if (requiresManagerApproval) {
      message = `Form submitted for Manager approval (${screensRequiringManagerApproval.length} screen(s))`;
    }

    res.json({
      success: true,
      data: {
        ...updatedSubmission,
        screensRequiringInsuranceApproval,
        screensRequiringManagerApproval,
      },
      message,
    });
  } catch (error) {
    console.error('Submit for approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Approve or reject submission (managers only)
export const processApproval = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body as { action: 'approve' | 'reject'; comments?: string };

    // Only managers can approve
    if (req.user?.type !== 'superadmin' && req.user?.role !== 'MANAGER') {
      res.status(403).json({
        success: false,
        error: 'Only managers can approve or reject submissions',
      });
      return;
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    // Manager can approve when status is PENDING_MANAGER_APPROVAL or PENDING_APPROVAL (legacy)
    if (submission.status !== 'PENDING_MANAGER_APPROVAL' && submission.status !== 'PENDING_APPROVAL') {
      res.status(400).json({
        success: false,
        error: 'Submission is not pending manager approval',
      });
      return;
    }

    // Check branch access for managers
    if (req.user?.type === 'user' && submission.branchId !== req.user.branchId) {
      res.status(403).json({
        success: false,
        error: 'You can only process approvals for your branch',
      });
      return;
    }

    const newStatus: SubmissionStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

    // Create approval record and update submission
    const [approval, updatedSubmission] = await prisma.$transaction([
      prisma.approval.create({
        data: {
          submissionId: id,
          managerId: req.user!.id,
          status: newStatus,
          comments,
        },
      }),
      prisma.formSubmission.update({
        where: { id },
        data: {
          status: newStatus,
          // Reset to draft if rejected so user can edit
          ...(action === 'reject' && { currentTabIndex: 0 }),
        },
        include: {
          flow: true,
          branch: true,
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          approvals: {
            include: {
              manager: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    // Record history
    await recordFormHistory(id, req.user!.id, action === 'approve' ? 'APPROVED' : 'REJECTED', {
      details: { comments, approverRole: 'MANAGER' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedSubmission,
      message: `Submission ${action}d successfully by Manager`,
    });
  } catch (error) {
    console.error('Process approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Insurance Executive approval
export const processInsuranceApproval = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body as { action: 'approve' | 'reject'; comments?: string };

    // Only Insurance Executives can process insurance approval
    if (req.user?.type !== 'superadmin' && req.user?.role !== 'INSURANCE_EXECUTIVE') {
      res.status(403).json({
        success: false,
        error: 'Only Insurance Executives can approve or reject insurance submissions',
      });
      return;
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    if (submission.status !== 'PENDING_INSURANCE_APPROVAL') {
      res.status(400).json({
        success: false,
        error: 'Submission is not pending insurance approval',
      });
      return;
    }

    // Check branch access
    if (req.user?.type === 'user' && submission.branchId !== req.user.branchId) {
      res.status(403).json({
        success: false,
        error: 'You can only process approvals for your branch',
      });
      return;
    }

    // Check if there are screens requiring manager approval
    const screensRequiringManagerApproval = submission.flow.flowScreens.filter(fs => fs.screen.requiresApproval);
    const requiresManagerApproval = screensRequiringManagerApproval.length > 0;

    let newStatus: SubmissionStatus;
    if (action === 'reject') {
      newStatus = 'REJECTED';
    } else if (requiresManagerApproval) {
      newStatus = 'PENDING_MANAGER_APPROVAL';
    } else {
      newStatus = 'APPROVED';
    }

    // Update submission with insurance approval info
    const updatedSubmission = await prisma.formSubmission.update({
      where: { id },
      data: {
        status: newStatus,
        insuranceApprovalStatus: action === 'approve' ? 'APPROVED' : 'REJECTED',
        insuranceApprovedById: req.user!.id,
        insuranceApprovedAt: new Date(),
        insuranceComments: comments,
        // Reset to draft if rejected so user can edit
        ...(action === 'reject' && { currentTabIndex: 0 }),
      },
      include: {
        flow: true,
        branch: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        insuranceApprovedBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Record history
    await recordFormHistory(id, req.user!.id, action === 'approve' ? 'INSURANCE_APPROVED' : 'INSURANCE_REJECTED', {
      details: { 
        comments,
        nextStep: action === 'approve' && requiresManagerApproval ? 'PENDING_MANAGER_APPROVAL' : newStatus,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    let message = `Submission ${action}d by Insurance Executive`;
    if (action === 'approve' && requiresManagerApproval) {
      message += '. Now pending Manager approval.';
    }

    res.json({
      success: true,
      data: updatedSubmission,
      message,
    });
  } catch (error) {
    console.error('Process insurance approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get pending approvals for manager
export const getPendingApprovals = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (req.user?.type !== 'superadmin' && req.user?.role !== 'MANAGER') {
      res.status(403).json({
        success: false,
        error: 'Only managers can view pending approvals',
      });
      return;
    }

    const where: any = {
      status: {
        in: ['PENDING_APPROVAL', 'PENDING_MANAGER_APPROVAL'],
      },
    };

    if (req.user?.type === 'user') {
      where.branchId = req.user.branchId;
    }

    const submissions = await prisma.formSubmission.findMany({
      where,
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: {
          include: {
            organization: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        insuranceApprovedBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Add screens requiring approval info to each submission
    const submissionsWithApprovalInfo = submissions.map(submission => {
      const screensRequiringApproval = submission.flow.flowScreens
        .filter(fs => fs.screen.requiresApproval)
        .map(fs => ({
          screenId: fs.screen.id,
          screenName: fs.screen.name,
          screenCode: fs.screen.code,
          tabName: fs.tabName,
          tabOrder: fs.tabOrder,
        }));

      return {
        ...submission,
        screensRequiringApproval,
      };
    });

    res.json({
      success: true,
      data: submissionsWithApprovalInfo,
    });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get pending insurance approvals (for Insurance Executives)
export const getPendingInsuranceApprovals = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (req.user?.type !== 'superadmin' && req.user?.role !== 'INSURANCE_EXECUTIVE') {
      res.status(403).json({
        success: false,
        error: 'Only Insurance Executives can view pending insurance approvals',
      });
      return;
    }

    const where: any = {
      status: 'PENDING_INSURANCE_APPROVAL',
    };

    if (req.user?.type === 'user') {
      where.branchId = req.user.branchId;
    }

    const submissions = await prisma.formSubmission.findMany({
      where,
      include: {
        flow: {
          include: {
            flowScreens: {
              include: {
                screen: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    requiresApproval: true,
                    requiresInsuranceApproval: true,
                  },
                },
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        branch: {
          include: {
            organization: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Add screens requiring insurance approval info to each submission
    const submissionsWithApprovalInfo = submissions.map(submission => {
      const screensRequiringInsuranceApproval = submission.flow.flowScreens
        .filter(fs => fs.screen.requiresInsuranceApproval)
        .map(fs => ({
          screenId: fs.screen.id,
          screenName: fs.screen.name,
          screenCode: fs.screen.code,
          tabName: fs.tabName,
          tabOrder: fs.tabOrder,
        }));

      return {
        ...submission,
        screensRequiringInsuranceApproval,
      };
    });

    res.json({
      success: true,
      data: submissionsWithApprovalInfo,
    });
  } catch (error) {
    console.error('Get pending insurance approvals error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get my submissions
export const getMySubmissions = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user || req.user.type !== 'user') {
      res.status(403).json({
        success: false,
        error: 'Only users can access this endpoint',
      });
      return;
    }

    const { status } = req.query;

    const where: any = {
      userId: req.user.id,
    };

    if (status) {
      where.status = status as SubmissionStatus;
    }

    const submissions = await prisma.formSubmission.findMany({
      where,
      include: {
        flow: {
          include: {
            flowScreens: {
              select: {
                id: true,
                tabName: true,
                tabOrder: true,
              },
              orderBy: { tabOrder: 'asc' },
            },
          },
        },
        approvals: {
          include: {
            manager: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: submissions,
    });
  } catch (error) {
    console.error('Get my submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Delete submission (draft only)
export const deleteSubmission = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const submission = await prisma.formSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
      return;
    }

    // Check ownership
    if (req.user?.type === 'user' && submission.userId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'You can only delete your own submissions',
      });
      return;
    }

    // Can only delete drafts
    if (submission.status !== 'DRAFT') {
      res.status(400).json({
        success: false,
        error: 'Can only delete draft submissions',
      });
      return;
    }

    await prisma.formSubmission.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Submission deleted successfully',
    });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get branch statistics (for managers)
export const getBranchStats = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.user || req.user.type !== 'user') {
      res.status(403).json({
        success: false,
        error: 'Only users can access this endpoint',
      });
      return;
    }

    const { role, branchId } = req.user;

    // Build filter based on role
    const where: any = { branchId };
    
    // Associates and Viewers can only see their own submissions
    if (role === 'ASSOCIATE' || role === 'VIEWER') {
      where.userId = req.user.id;
    }
    // Managers and Insurance Executives see all branch submissions

    const submissions = await prisma.formSubmission.findMany({
      where,
      select: {
        id: true,
        status: true,
        insuranceApprovalStatus: true,
      },
    });

    const stats = {
      total: submissions.length,
      draft: submissions.filter(s => s.status === 'DRAFT').length,
      pendingInsurance: submissions.filter(s => s.status === 'PENDING_INSURANCE_APPROVAL').length,
      pendingManager: submissions.filter(s => s.status === 'PENDING_MANAGER_APPROVAL' || s.status === 'PENDING_APPROVAL').length,
      pending: submissions.filter(s => 
        s.status === 'PENDING_APPROVAL' || 
        s.status === 'PENDING_INSURANCE_APPROVAL' || 
        s.status === 'PENDING_MANAGER_APPROVAL'
      ).length,
      approved: submissions.filter(s => s.status === 'APPROVED').length,
      rejected: submissions.filter(s => s.status === 'REJECTED').length,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get branch stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

