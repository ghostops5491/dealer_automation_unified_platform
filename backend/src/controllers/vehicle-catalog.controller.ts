import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types';
import { prisma } from '../lib/prisma';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'catalogs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `vehicle-catalog-${timestamp}.csv`);
  },
});

const csvFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'));
  }
};

export const csvUpload = multer({
  storage,
  fileFilter: csvFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Upload CSV and import vehicle catalog data
export const uploadCatalog = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No CSV file uploaded',
      });
      return;
    }

    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({
        success: false,
        error: 'Branch ID is required. Super admins must use branch-specific operations.',
      });
      return;
    }

    // Parse CSV file
    const results: Array<{
      brand: string;
      model: string;
      variant: string;
      colour: string;
      fuelType: string;
    }> = [];

    const errors: string[] = [];
    let rowNumber = 0;

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(req.file!.path)
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        }))
        .on('data', (row) => {
          rowNumber++;
          
          // Map various column name formats
          const brand = row.brand || row.brand_name || '';
          const model = row.model || row.model_name || '';
          const variant = row.variant || row.variant_name || '';
          const colour = row.colour || row.color || row.colour_name || row.color_name || '';
          const fuelType = row.fuel_type || row.fueltype || row.fuel || '';

          if (!brand || !model || !variant || !colour || !fuelType) {
            errors.push(`Row ${rowNumber}: Missing required fields. Got: Brand="${brand}", Model="${model}", Variant="${variant}", Colour="${colour}", Fuel Type="${fuelType}"`);
            return;
          }

          results.push({
            brand: brand.trim(),
            model: model.trim(),
            variant: variant.trim(),
            colour: colour.trim(),
            fuelType: fuelType.trim(),
          });
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });

    if (results.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid data found in CSV',
        data: { errors },
      });
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return;
    }

    // Clear existing catalog for this branch and insert new data
    await prisma.$transaction(async (tx) => {
      // Delete existing catalog entries for this branch
      await tx.vehicleCatalog.deleteMany({
        where: { branchId },
      });

      // Insert new catalog entries
      await tx.vehicleCatalog.createMany({
        data: results.map((item) => ({
          branchId,
          brand: item.brand,
          model: item.model,
          variant: item.variant,
          colour: item.colour,
          fuelType: item.fuelType,
        })),
      });
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Successfully imported ${results.length} vehicle catalog entries`,
      data: {
        imported: results.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : [], // Return first 10 errors
        totalErrors: errors.length,
      },
    });
  } catch (error) {
    console.error('Upload catalog error:', error);
    // Clean up uploaded file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: 'Failed to import vehicle catalog',
    });
  }
};

// Get all catalog entries for current branch
export const getCatalog = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const catalog = await prisma.vehicleCatalog.findMany({
      where: { branchId },
      orderBy: [
        { brand: 'asc' },
        { model: 'asc' },
        { variant: 'asc' },
        { colour: 'asc' },
        { fuelType: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: catalog,
    });
  } catch (error) {
    console.error('Get catalog error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle catalog',
    });
  }
};

// Get unique brands for current branch
export const getBrands = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const brands = await prisma.vehicleCatalog.findMany({
      where: { branchId },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });

    res.json({
      success: true,
      data: brands.map((b) => b.brand),
    });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch brands',
    });
  }
};

// Get models for a specific brand
export const getModels = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const { brand } = req.query;

    if (!brand || typeof brand !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Brand parameter is required',
      });
      return;
    }

    const models = await prisma.vehicleCatalog.findMany({
      where: { 
        branchId,
        brand: brand,
      },
      select: { model: true },
      distinct: ['model'],
      orderBy: { model: 'asc' },
    });

    res.json({
      success: true,
      data: models.map((m) => m.model),
    });
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch models',
    });
  }
};

// Get variants for a specific brand and model
export const getVariants = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const { brand, model } = req.query;

    if (!brand || typeof brand !== 'string' || !model || typeof model !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Brand and model parameters are required',
      });
      return;
    }

    const variants = await prisma.vehicleCatalog.findMany({
      where: { 
        branchId,
        brand,
        model,
      },
      select: { variant: true },
      distinct: ['variant'],
      orderBy: { variant: 'asc' },
    });

    res.json({
      success: true,
      data: variants.map((v) => v.variant),
    });
  } catch (error) {
    console.error('Get variants error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch variants',
    });
  }
};

// Get colours for a specific brand, model, and variant
export const getColours = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const { brand, model, variant } = req.query;

    if (!brand || typeof brand !== 'string' || 
        !model || typeof model !== 'string' || 
        !variant || typeof variant !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Brand, model, and variant parameters are required',
      });
      return;
    }

    const colours = await prisma.vehicleCatalog.findMany({
      where: { 
        branchId,
        brand,
        model,
        variant,
      },
      select: { colour: true },
      distinct: ['colour'],
      orderBy: { colour: 'asc' },
    });

    res.json({
      success: true,
      data: colours.map((c) => c.colour),
    });
  } catch (error) {
    console.error('Get colours error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch colours',
    });
  }
};

// Get fuel types for a specific brand, model, variant, and colour
export const getFuelTypes = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const { brand, model, variant, colour } = req.query;

    if (!brand || typeof brand !== 'string' || 
        !model || typeof model !== 'string' || 
        !variant || typeof variant !== 'string' ||
        !colour || typeof colour !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Brand, model, variant, and colour parameters are required',
      });
      return;
    }

    const fuelTypes = await prisma.vehicleCatalog.findMany({
      where: { 
        branchId,
        brand,
        model,
        variant,
        colour,
      },
      select: { fuelType: true },
      distinct: ['fuelType'],
      orderBy: { fuelType: 'asc' },
    });

    res.json({
      success: true,
      data: fuelTypes.map((f) => f.fuelType),
    });
  } catch (error) {
    console.error('Get fuel types error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fuel types',
    });
  }
};

// Delete all catalog entries for current branch
export const deleteCatalog = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const result = await prisma.vehicleCatalog.deleteMany({
      where: { branchId },
    });

    res.json({
      success: true,
      message: `Deleted ${result.count} catalog entries`,
      data: { deleted: result.count },
    });
  } catch (error) {
    console.error('Delete catalog error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete vehicle catalog',
    });
  }
};

// Get catalog summary (counts)
export const getCatalogSummary = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const user = req.user!;
    const branchId = user.branchId;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'Branch ID is required' });
      return;
    }

    const [totalCount, brandCount, modelCount, variantCount] = await Promise.all([
      prisma.vehicleCatalog.count({ where: { branchId } }),
      prisma.vehicleCatalog.findMany({
        where: { branchId },
        select: { brand: true },
        distinct: ['brand'],
      }),
      prisma.vehicleCatalog.findMany({
        where: { branchId },
        select: { model: true },
        distinct: ['model'],
      }),
      prisma.vehicleCatalog.findMany({
        where: { branchId },
        select: { variant: true },
        distinct: ['variant'],
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalEntries: totalCount,
        uniqueBrands: brandCount.length,
        uniqueModels: modelCount.length,
        uniqueVariants: variantCount.length,
      },
    });
  } catch (error) {
    console.error('Get catalog summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch catalog summary',
    });
  }
};

// Download sample CSV template
export const downloadTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const template = `Brand,Model,Variant,Colour,Fuel Type
Maruti Suzuki,Swift,ZXi Plus,Pearl Arctic White,Petrol
Maruti Suzuki,Swift,ZXi,Pearl Arctic White,Petrol
Maruti Suzuki,Swift,VXi,Solid Fire Red,Petrol
Hyundai,Creta,SX (O),Titan Grey,Diesel
Hyundai,Creta,SX,Atlas White,Petrol
Tata,Nexon,Fearless Plus,Daytona Grey,Petrol
Tata,Nexon,Fearless,Flame Red,Diesel`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vehicle-catalog-template.csv');
    res.send(template);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download template',
    });
  }
};
