import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, ApiResponse, CreateFlowDto, UpdateFlowDto, AddFlowScreenDto, CreateFlowAssignmentDto } from '../types';

export const getAllFlows = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const flows = await prisma.flow.findMany({
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
        flowAssignments: {
          include: {
            branch: {
              include: {
                organization: true,
              },
            },
          },
        },
        _count: {
          select: { formSubmissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    console.error('Get flows error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getFlowById = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    const flow = await prisma.flow.findUnique({
      where: { id },
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
        flowAssignments: {
          include: {
            branch: {
              include: {
                organization: true,
              },
            },
          },
        },
      },
    });

    if (!flow) {
      res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
      return;
    }

    res.json({
      success: true,
      data: flow,
    });
  } catch (error) {
    console.error('Get flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const createFlow = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { name, code, description } = req.body as CreateFlowDto;

    // Check if code already exists
    const existing = await prisma.flow.findUnique({
      where: { code },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Flow code already exists',
      });
      return;
    }

    const flow = await prisma.flow.create({
      data: {
        name,
        code: code.toUpperCase().replace(/\s+/g, '_'),
        description,
      },
      include: {
        flowScreens: true,
        flowAssignments: true,
      },
    });

    res.status(201).json({
      success: true,
      data: flow,
      message: 'Flow created successfully',
    });
  } catch (error) {
    console.error('Create flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateFlow = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body as UpdateFlowDto;

    const flow = await prisma.flow.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        flowScreens: {
          include: {
            screen: true,
          },
          orderBy: { tabOrder: 'asc' },
        },
        flowAssignments: true,
      },
    });

    res.json({
      success: true,
      data: flow,
      message: 'Flow updated successfully',
    });
  } catch (error) {
    console.error('Update flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const deleteFlow = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if flow has submissions
    const submissions = await prisma.formSubmission.findMany({
      where: { flowId: id },
    });

    if (submissions.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete flow with existing submissions',
      });
      return;
    }

    await prisma.flow.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Flow deleted successfully',
    });
  } catch (error) {
    console.error('Delete flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Flow Screens (Tabs)
export const addFlowScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { flowId, screenId, tabOrder, tabName } = req.body as AddFlowScreenDto;

    // Check if screen already in flow
    const existing = await prisma.flowScreen.findUnique({
      where: {
        flowId_screenId: {
          flowId,
          screenId,
        },
      },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: 'Screen already exists in this flow',
      });
      return;
    }

    // Check if tab order already exists
    const existingOrder = await prisma.flowScreen.findUnique({
      where: {
        flowId_tabOrder: {
          flowId,
          tabOrder,
        },
      },
    });

    if (existingOrder) {
      // Shift existing tabs
      await prisma.flowScreen.updateMany({
        where: {
          flowId,
          tabOrder: { gte: tabOrder },
        },
        data: {
          tabOrder: { increment: 1 },
        },
      });
    }

    const flowScreen = await prisma.flowScreen.create({
      data: {
        flowId,
        screenId,
        tabOrder,
        tabName,
      },
      include: {
        screen: {
          include: {
            fields: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: flowScreen,
      message: 'Screen added to flow successfully',
    });
  } catch (error) {
    console.error('Add flow screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateFlowScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { flowScreenId } = req.params;
    const { tabName, tabOrder } = req.body;

    const flowScreen = await prisma.flowScreen.update({
      where: { id: flowScreenId },
      data: {
        ...(tabName && { tabName }),
        ...(tabOrder !== undefined && { tabOrder }),
      },
      include: {
        screen: true,
      },
    });

    res.json({
      success: true,
      data: flowScreen,
      message: 'Flow screen updated successfully',
    });
  } catch (error) {
    console.error('Update flow screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const removeFlowScreen = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { flowScreenId } = req.params;

    const flowScreen = await prisma.flowScreen.findUnique({
      where: { id: flowScreenId },
    });

    if (!flowScreen) {
      res.status(404).json({
        success: false,
        error: 'Flow screen not found',
      });
      return;
    }

    await prisma.flowScreen.delete({
      where: { id: flowScreenId },
    });

    // Reorder remaining screens
    await prisma.flowScreen.updateMany({
      where: {
        flowId: flowScreen.flowId,
        tabOrder: { gt: flowScreen.tabOrder },
      },
      data: {
        tabOrder: { decrement: 1 },
      },
    });

    res.json({
      success: true,
      message: 'Screen removed from flow successfully',
    });
  } catch (error) {
    console.error('Remove flow screen error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Reorder flow screens
export const reorderFlowScreens = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;
    const { screenOrders } = req.body as { screenOrders: { flowScreenId: string; tabOrder: number }[] };

    await prisma.$transaction(
      screenOrders.map(({ flowScreenId, tabOrder }) =>
        prisma.flowScreen.update({
          where: { id: flowScreenId, flowId: id },
          data: { tabOrder },
        })
      )
    );

    const flow = await prisma.flow.findUnique({
      where: { id },
      include: {
        flowScreens: {
          include: {
            screen: true,
          },
          orderBy: { tabOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: flow,
      message: 'Flow screens reordered successfully',
    });
  } catch (error) {
    console.error('Reorder flow screens error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Flow Assignments
export const assignFlowToBranch = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const {
      flowId,
      branchId,
      accessibleByManager,
      accessibleByAssociate,
      accessibleByViewer,
    } = req.body as CreateFlowAssignmentDto;

    const assignment = await prisma.flowAssignment.upsert({
      where: {
        flowId_branchId: {
          flowId,
          branchId,
        },
      },
      update: {
        accessibleByManager: accessibleByManager ?? true,
        accessibleByAssociate: accessibleByAssociate ?? true,
        accessibleByViewer: accessibleByViewer ?? true,
      },
      create: {
        flowId,
        branchId,
        accessibleByManager: accessibleByManager ?? true,
        accessibleByAssociate: accessibleByAssociate ?? true,
        accessibleByViewer: accessibleByViewer ?? true,
      },
      include: {
        flow: true,
        branch: {
          include: {
            organization: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: assignment,
      message: 'Flow assigned to branch successfully',
    });
  } catch (error) {
    console.error('Assign flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const unassignFlowFromBranch = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { assignmentId } = req.params;

    await prisma.flowAssignment.delete({
      where: { id: assignmentId },
    });

    res.json({
      success: true,
      message: 'Flow unassigned from branch successfully',
    });
  } catch (error) {
    console.error('Unassign flow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get a specific flow for current user (checks access)
export const getFlowForUser = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    // Superadmin can access any flow
    if (req.user?.type === 'superadmin') {
      const flow = await prisma.flow.findUnique({
        where: { id },
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
          flowAssignments: {
            include: {
              branch: {
                include: {
                  organization: true,
                },
              },
            },
          },
        },
      });

      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found',
        });
        return;
      }

      res.json({
        success: true,
        data: flow,
      });
      return;
    }

    // For regular users, check if they have access to this flow
    if (!req.user || req.user.type !== 'user') {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      });
      return;
    }

    const { branchId, role } = req.user;

    const roleAccessMap: Record<string, string> = {
      MANAGER: 'accessibleByManager',
      ASSOCIATE: 'accessibleByAssociate',
      VIEWER: 'accessibleByViewer',
    };

    const accessField = roleAccessMap[role!];

    // Check if user has access to this flow
    const assignment = await prisma.flowAssignment.findFirst({
      where: {
        flowId: id,
        branchId,
        [accessField]: true,
        flow: {
          isActive: true,
        },
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

    if (!assignment) {
      res.status(404).json({
        success: false,
        error: 'Flow not found or you do not have access',
      });
      return;
    }

    res.json({
      success: true,
      data: assignment.flow,
    });
  } catch (error) {
    console.error('Get flow for user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Get flows for current user
export const getMyFlows = async (
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

    const { branchId, role } = req.user;

    const roleAccessMap: Record<string, string> = {
      MANAGER: 'accessibleByManager',
      ASSOCIATE: 'accessibleByAssociate',
      VIEWER: 'accessibleByViewer',
    };

    const accessField = roleAccessMap[role!];

    const assignments = await prisma.flowAssignment.findMany({
      where: {
        branchId,
        [accessField]: true,
        flow: {
          isActive: true,
        },
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

    const flows = assignments.map((a) => a.flow);

    res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    console.error('Get my flows error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

