import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create SuperAdmin
  const hashedPassword = await bcrypt.hash('Superadmin@123', 12);
  
  const superadmin = await prisma.superAdmin.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      password: hashedPassword,
    },
  });

  console.log('✅ SuperAdmin created:', superadmin.username);

  // Create a sample organization
  const org = await prisma.organization.upsert({
    where: { code: 'ORG001' },
    update: {},
    create: {
      name: 'Demo Organization',
      code: 'ORG001',
      description: 'A demo organization for testing',
    },
  });

  console.log('✅ Organization created:', org.name);

  // Create a sample branch with timeline
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year from now

  const branch = await prisma.branch.upsert({
    where: { code: 'BR001' },
    update: {
      managerValidUntil: futureDate,
      associateValidUntil: futureDate,
      viewerValidUntil: futureDate,
      insuranceExecutiveValidUntil: futureDate,
    },
    create: {
      name: 'Main Branch',
      code: 'BR001',
      description: 'Main branch of demo organization',
      organizationId: org.id,
      managerValidUntil: futureDate,
      associateValidUntil: futureDate,
      viewerValidUntil: futureDate,
      insuranceExecutiveValidUntil: futureDate,
      requiresApproval: true,
    },
  });

  console.log('✅ Branch created:', branch.name);

  // Create sample users
  const managerPassword = await bcrypt.hash('Manager@123', 12);
  const associatePassword = await bcrypt.hash('Associate@123', 12);
  const viewerPassword = await bcrypt.hash('Viewer@123', 12);

  const manager = await prisma.user.upsert({
    where: { username: 'manager1' },
    update: {
      validUntil: futureDate,
      isActive: true,
    },
    create: {
      username: 'manager1',
      password: managerPassword,
      firstName: 'John',
      lastName: 'Manager',
      email: 'manager@demo.com',
      role: 'MANAGER',
      branchId: branch.id,
      validUntil: futureDate,
    },
  });

  const associate = await prisma.user.upsert({
    where: { username: 'associate1' },
    update: {
      validUntil: futureDate,
      isActive: true,
    },
    create: {
      username: 'associate1',
      password: associatePassword,
      firstName: 'Jane',
      lastName: 'Associate',
      email: 'associate@demo.com',
      role: 'ASSOCIATE',
      branchId: branch.id,
      validUntil: futureDate,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { username: 'viewer1' },
    update: {
      validUntil: futureDate,
      isActive: true,
    },
    create: {
      username: 'viewer1',
      password: viewerPassword,
      firstName: 'Bob',
      lastName: 'Viewer',
      email: 'viewer@demo.com',
      role: 'VIEWER',
      branchId: branch.id,
      validUntil: futureDate,
    },
  });

  console.log('✅ Users created:', manager.username, associate.username, viewer.username);

  // ============================================
  // SCREEN 1: Customer & Enquiry
  // ============================================
  const customerEnquiryScreen = await prisma.screen.upsert({
    where: { code: 'customer_enquiry' },
    update: {},
    create: {
      name: 'Customer & Enquiry',
      code: 'customer_enquiry',
      description: 'Customer and enquiry details',
    },
  });

  // Delete existing fields for this screen to avoid duplicates on re-seed
  await prisma.screenField.deleteMany({
    where: { screenId: customerEnquiryScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      {
        screenId: customerEnquiryScreen.id,
        name: 'enquiry_no',
        label: 'Enquiry No',
        fieldType: 'TEXT',
        placeholder: 'Auto-generated',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 1,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'enquiry',
        label: 'Enquiry',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'oem_dms_1', label: 'OEM DMS Source 1' },
          { value: 'oem_dms_2', label: 'OEM DMS Source 2' },
          { value: 'walk_in', label: 'Walk-in' },
          { value: 'referral', label: 'Referral' },
          { value: 'online', label: 'Online' },
        ]),
        sortOrder: 2,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'ownership_type',
        label: 'Ownership Type',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'individual', label: 'Individual' },
          { value: 'company', label: 'Company' },
        ]),
        sortOrder: 3,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'salutation',
        label: 'Salutation',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'mr', label: 'Mr.' },
          { value: 'mrs', label: 'Mrs.' },
          { value: 'ms', label: 'Ms.' },
          { value: 'dr', label: 'Dr.' },
        ]),
        sortOrder: 4,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'first_name',
        label: 'First Name',
        fieldType: 'TEXT',
        placeholder: 'Enter first name',
        isRequired: true,
        validationRegex: '^[a-zA-Z\\s]{2,50}$',
        validationMessage: 'First name must contain only letters (2-50 characters)',
        sortOrder: 5,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'last_name',
        label: 'Last Name',
        fieldType: 'TEXT',
        placeholder: 'Enter last name (optional)',
        isRequired: false,
        validationRegex: '^[a-zA-Z\\s]{0,50}$',
        validationMessage: 'Last name must contain only letters (max 50 characters)',
        sortOrder: 6,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'dob',
        label: 'Date of Birth',
        fieldType: 'DATE',
        isRequired: false,
        sortOrder: 7,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'mobile_no',
        label: 'Mobile No',
        fieldType: 'NUMBER',
        placeholder: 'Enter 10-digit mobile number',
        isRequired: true,
        validationRegex: '^[6-9][0-9]{9}$',
        validationMessage: 'Mobile number must be 10 digits starting with 6-9',
        sortOrder: 8,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'rep_name',
        label: 'Rep Name',
        fieldType: 'TEXT',
        placeholder: 'Enter representative name',
        isRequired: true,
        validationRegex: '^[a-zA-Z\\s]{2,50}$',
        validationMessage: 'Rep name must contain only letters',
        sortOrder: 9,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'rep_relation',
        label: 'Rep Relation',
        fieldType: 'TEXT',
        placeholder: 'Enter relationship',
        isRequired: true,
        validationRegex: '^[a-zA-Z\\s]{2,50}$',
        validationMessage: 'Relation must contain only letters',
        sortOrder: 10,
      },
      {
        screenId: customerEnquiryScreen.id,
        name: 'executive_name',
        label: 'Executive Name',
        fieldType: 'TEXT',
        placeholder: 'Enter executive name',
        isRequired: true,
        validationRegex: '^[a-zA-Z\\s]{2,50}$',
        validationMessage: 'Executive name must contain only letters',
        sortOrder: 11,
      },
    ],
  });

  console.log('✅ Screen 1 created: Customer & Enquiry');

  // ============================================
  // SCREEN 2: Address and More Details
  // ============================================
  const addressScreen = await prisma.screen.upsert({
    where: { code: 'address_and_details' },
    update: {},
    create: {
      name: 'Address and More Details',
      code: 'address_and_details',
      description: 'Address and document details',
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: addressScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      {
        screenId: addressScreen.id,
        name: 'email',
        label: 'Email',
        fieldType: 'EMAIL',
        placeholder: 'Enter email address',
        isRequired: false,
        validationRegex: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
        validationMessage: 'Please enter a valid email address',
        sortOrder: 1,
      },
      {
        screenId: addressScreen.id,
        name: 'house_number',
        label: 'House Number',
        fieldType: 'TEXT',
        placeholder: 'Enter house/flat number',
        isRequired: false,
        sortOrder: 2,
      },
      {
        screenId: addressScreen.id,
        name: 'landmark',
        label: 'Landmark',
        fieldType: 'TEXT',
        placeholder: 'Enter nearby landmark',
        isRequired: false,
        sortOrder: 3,
      },
      {
        screenId: addressScreen.id,
        name: 'address',
        label: 'Address',
        fieldType: 'TEXTAREA',
        placeholder: 'Enter complete address',
        isRequired: true,
        sortOrder: 4,
      },
      {
        screenId: addressScreen.id,
        name: 'city',
        label: 'City',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'hyderabad', label: 'Hyderabad' },
          { value: 'secunderabad', label: 'Secunderabad' },
          { value: 'warangal', label: 'Warangal' },
          { value: 'nizamabad', label: 'Nizamabad' },
          { value: 'karimnagar', label: 'Karimnagar' },
          { value: 'khammam', label: 'Khammam' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 5,
      },
      {
        screenId: addressScreen.id,
        name: 'state',
        label: 'State',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'telangana', label: 'Telangana' },
          { value: 'andhra_pradesh', label: 'Andhra Pradesh' },
          { value: 'karnataka', label: 'Karnataka' },
          { value: 'maharashtra', label: 'Maharashtra' },
          { value: 'tamil_nadu', label: 'Tamil Nadu' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 6,
      },
      {
        screenId: addressScreen.id,
        name: 'district',
        label: 'District',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'hyderabad', label: 'Hyderabad' },
          { value: 'rangareddy', label: 'Rangareddy' },
          { value: 'medchal', label: 'Medchal-Malkajgiri' },
          { value: 'sangareddy', label: 'Sangareddy' },
          { value: 'warangal_urban', label: 'Warangal Urban' },
          { value: 'warangal_rural', label: 'Warangal Rural' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 7,
      },
      {
        screenId: addressScreen.id,
        name: 'mandal',
        label: 'Mandal',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'charminar', label: 'Charminar' },
          { value: 'secunderabad', label: 'Secunderabad' },
          { value: 'ameerpet', label: 'Ameerpet' },
          { value: 'kukatpally', label: 'Kukatpally' },
          { value: 'lb_nagar', label: 'LB Nagar' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 8,
      },
      {
        screenId: addressScreen.id,
        name: 'pincode',
        label: 'Pincode',
        fieldType: 'NUMBER',
        placeholder: 'Enter 6-digit pincode',
        isRequired: true,
        validationRegex: '^[1-9][0-9]{5}$',
        validationMessage: 'Pincode must be 6 digits',
        sortOrder: 9,
      },
      // === PAN Fields (shown for both Individual and Company) ===
      {
        screenId: addressScreen.id,
        name: 'pan',
        label: 'PAN Number',
        fieldType: 'TEXT',
        placeholder: 'Enter PAN number (e.g., ABCDE1234F)',
        isRequired: true,
        validationRegex: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
        validationMessage: 'PAN must be in format: ABCDE1234F',
        sortOrder: 10,
      },
      {
        screenId: addressScreen.id,
        name: 'pan_file',
        label: 'PAN Photo/File',
        fieldType: 'FILE',
        isRequired: true,
        sortOrder: 11,
      },
      // === Aadhaar Fields (shown only for Individual) ===
      {
        screenId: addressScreen.id,
        name: 'aadhaar',
        label: 'Aadhaar Number',
        fieldType: 'TEXT',
        placeholder: 'Enter 12-digit Aadhaar number',
        isRequired: true,
        validationRegex: '^[0-9]{12}$',
        validationMessage: 'Aadhaar must be 12 digits',
        conditionalField: 'customer_enquiry.ownership_type',
        conditionalValue: 'individual',
        sortOrder: 12,
      },
      {
        screenId: addressScreen.id,
        name: 'aadhaar_file',
        label: 'Aadhaar Photo/File',
        fieldType: 'FILE',
        isRequired: true,
        conditionalField: 'customer_enquiry.ownership_type',
        conditionalValue: 'individual',
        sortOrder: 13,
      },
      // === GST Fields (shown only for Company) ===
      {
        screenId: addressScreen.id,
        name: 'gst_number',
        label: 'GST Number',
        fieldType: 'TEXT',
        placeholder: 'Enter GST number (e.g., 22AAAAA0000A1Z5)',
        isRequired: true,
        validationRegex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
        validationMessage: 'Please enter a valid GST number',
        conditionalField: 'customer_enquiry.ownership_type',
        conditionalValue: 'company',
        sortOrder: 14,
      },
      {
        screenId: addressScreen.id,
        name: 'gst_certificate_file',
        label: 'GST Certificate',
        fieldType: 'FILE',
        isRequired: true,
        conditionalField: 'customer_enquiry.ownership_type',
        conditionalValue: 'company',
        sortOrder: 15,
      },
      // === Address Proof (shown for all) ===
      {
        screenId: addressScreen.id,
        name: 'address_proof',
        label: 'Address Proof Type',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'electricity_bill', label: 'Electricity Bill' },
          { value: 'water_bill', label: 'Water Bill' },
          { value: 'gas_bill', label: 'Gas Bill' },
          { value: 'rent_agreement', label: 'Rent Agreement' },
          { value: 'bank_statement', label: 'Bank Statement' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 16,
      },
      {
        screenId: addressScreen.id,
        name: 'address_proof_file',
        label: 'Address Proof Document',
        fieldType: 'FILE',
        isRequired: true,
        sortOrder: 17,
      },
    ],
  });

  console.log('✅ Screen 2 created: Address and More Details');

  // ============================================
  // SCREEN 3: Vehicle Details
  // ============================================
  const vehicleScreen = await prisma.screen.upsert({
    where: { code: 'vehicle_details' },
    update: {},
    create: {
      name: 'Vehicle Details',
      code: 'vehicle_details',
      description: 'Vehicle information',
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: vehicleScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      // Cascading vehicle fields (Brand → Model → Variant → Colour → Fuel Type)
      // Options are loaded from VehicleCatalog - these are fallbacks if no catalog is uploaded
      {
        screenId: vehicleScreen.id,
        name: 'brand',
        label: 'Brand',
        fieldType: 'SELECT',
        isRequired: true,
        placeholder: 'Select brand (from vehicle catalog)',
        options: JSON.stringify([
          { value: 'Tata', label: 'Tata' },
          { value: 'Mahindra', label: 'Mahindra' },
          { value: 'Maruti Suzuki', label: 'Maruti Suzuki' },
          { value: 'Hyundai', label: 'Hyundai' },
          { value: 'Honda', label: 'Honda' },
          { value: 'Toyota', label: 'Toyota' },
          { value: 'Kia', label: 'Kia' },
          { value: 'MG', label: 'MG' },
          { value: 'Skoda', label: 'Skoda' },
          { value: 'Volkswagen', label: 'Volkswagen' },
        ]),
        sortOrder: 1,
      },
      {
        screenId: vehicleScreen.id,
        name: 'model',
        label: 'Model',
        fieldType: 'SELECT',
        isRequired: true,
        placeholder: 'Select model (depends on brand)',
        options: JSON.stringify([]),
        sortOrder: 2,
      },
      {
        screenId: vehicleScreen.id,
        name: 'variant',
        label: 'Variant',
        fieldType: 'SELECT',
        isRequired: true,
        placeholder: 'Select variant (depends on model)',
        options: JSON.stringify([]),
        sortOrder: 3,
      },
      {
        screenId: vehicleScreen.id,
        name: 'color',
        label: 'Colour',
        fieldType: 'SELECT',
        isRequired: true,
        placeholder: 'Select colour (depends on variant)',
        options: JSON.stringify([]),
        sortOrder: 4,
      },
      {
        screenId: vehicleScreen.id,
        name: 'fuel_type',
        label: 'Fuel Type',
        fieldType: 'SELECT',
        isRequired: true,
        placeholder: 'Select fuel type (depends on colour)',
        options: JSON.stringify([
          { value: 'Petrol', label: 'Petrol' },
          { value: 'Diesel', label: 'Diesel' },
          { value: 'CNG', label: 'CNG' },
          { value: 'LPG', label: 'LPG' },
          { value: 'Hybrid', label: 'Hybrid' },
          { value: 'Electric', label: 'Electric' },
        ]),
        sortOrder: 5,
      },
      // Other vehicle fields
      {
        screenId: vehicleScreen.id,
        name: 'registration_type',
        label: 'Registration Type',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'temporary', label: 'Temporary' },
          { value: 'permanent', label: 'Permanent' },
        ]),
        sortOrder: 6,
      },
      {
        screenId: vehicleScreen.id,
        name: 'chassis_no',
        label: 'Chassis No',
        fieldType: 'TEXT',
        placeholder: 'Enter chassis number',
        isRequired: true,
        sortOrder: 7,
      },
      {
        screenId: vehicleScreen.id,
        name: 'engine_no',
        label: 'Engine No',
        fieldType: 'TEXT',
        placeholder: 'Enter engine number',
        isRequired: true,
        sortOrder: 8,
      },
      {
        screenId: vehicleScreen.id,
        name: 'comments',
        label: 'Comments',
        fieldType: 'TEXTAREA',
        placeholder: 'Enter any comments',
        isRequired: false,
        sortOrder: 9,
      },
      {
        screenId: vehicleScreen.id,
        name: 'key_no',
        label: 'Key Number',
        fieldType: 'TEXT',
        placeholder: 'Enter key number',
        isRequired: false,
        sortOrder: 10,
      },
      {
        screenId: vehicleScreen.id,
        name: 'battery_no',
        label: 'Battery Number',
        fieldType: 'TEXT',
        placeholder: 'Enter battery number',
        isRequired: false,
        sortOrder: 11,
      },
      {
        screenId: vehicleScreen.id,
        name: 'booking_no',
        label: 'Booking Number',
        fieldType: 'TEXT',
        placeholder: 'Enter booking number',
        isRequired: false,
        sortOrder: 12,
      },
    ],
  });

  console.log('✅ Screen 3 created: Vehicle Details');

  // ============================================
  // SCREEN 4: Amounts & Tax
  // ============================================
  const amountsScreen = await prisma.screen.upsert({
    where: { code: 'amounts_tax' },
    update: {
      requiresApproval: true, // This screen requires manager approval
    },
    create: {
      name: 'Amounts & Tax',
      code: 'amounts_tax',
      description: 'Amount and tax details',
      requiresApproval: true, // This screen requires manager approval
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: amountsScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      {
        screenId: amountsScreen.id,
        name: 'booking_date',
        label: 'Booking Date',
        fieldType: 'DATE',
        isRequired: true,
        validationMessage: 'Booking date cannot be in the past',
        sortOrder: 1,
      },
      {
        screenId: amountsScreen.id,
        name: 'payment_mode',
        label: 'Payment Mode',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'cash', label: 'Cash' },
          { value: 'cheque', label: 'Cheque' },
          { value: 'demand_draft', label: 'Demand Draft' },
          { value: 'neft', label: 'NEFT' },
          { value: 'rtgs', label: 'RTGS' },
          { value: 'imps', label: 'IMPS' },
          { value: 'upi', label: 'UPI' },
          { value: 'debit_card', label: 'Debit Card' },
          { value: 'credit_card', label: 'Credit Card' },
          { value: 'credit_card_emi', label: 'Credit Card EMI' },
          { value: 'auto_loan', label: 'Auto Loan' },
          { value: 'bank_finance', label: 'Bank Finance' },
          { value: 'nbfc_finance', label: 'NBFC Finance' },
          { value: 'oem_finance', label: 'OEM Finance' },
          { value: 'corporate_payment', label: 'Corporate / Company Payment' },
          { value: 'lease', label: 'Lease' },
          { value: 'exchange_adjustment', label: 'Exchange Adjustment' },
          { value: 'wallet', label: 'Wallet' },
        ]),
        sortOrder: 2,
      },
      {
        screenId: amountsScreen.id,
        name: 'base_amount',
        label: 'Base Amount',
        fieldType: 'NUMBER',
        placeholder: 'Enter base amount',
        isRequired: true,
        sortOrder: 3,
      },
      {
        screenId: amountsScreen.id,
        name: 'other_amount',
        label: 'Other Amount',
        fieldType: 'NUMBER',
        placeholder: 'Enter other amount',
        isRequired: true,
        sortOrder: 4,
      },
      {
        screenId: amountsScreen.id,
        name: 'life_tax_amount',
        label: 'Life Tax Amount',
        fieldType: 'NUMBER',
        placeholder: 'Auto-calculated',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 5,
      },
      {
        screenId: amountsScreen.id,
        name: 'extended_warranty',
        label: 'Extended Warranty (Date/KM)',
        fieldType: 'TEXT',
        placeholder: 'Enter warranty period or KM',
        isRequired: true,
        sortOrder: 6,
      },
      {
        screenId: amountsScreen.id,
        name: 'total_amount',
        label: 'Total Amount',
        fieldType: 'NUMBER',
        placeholder: 'System calculated',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 7,
      },
      {
        screenId: amountsScreen.id,
        name: 'discount',
        label: 'Discount',
        fieldType: 'NUMBER',
        placeholder: 'Enter discount amount',
        isRequired: false,
        sortOrder: 8,
      },
      {
        screenId: amountsScreen.id,
        name: 'ew_discount',
        label: 'EW Discount',
        fieldType: 'NUMBER',
        placeholder: 'Enter EW discount',
        isRequired: false,
        sortOrder: 9,
      },
      {
        screenId: amountsScreen.id,
        name: 'hypothecation',
        label: 'Hypothecation',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'none', label: 'None' },
          { value: 'hdfc_bank', label: 'HDFC Bank' },
          { value: 'icici_bank', label: 'ICICI Bank' },
          { value: 'sbi', label: 'SBI' },
          { value: 'axis_bank', label: 'Axis Bank' },
          { value: 'kotak', label: 'Kotak Mahindra' },
          { value: 'bajaj', label: 'Bajaj Finance' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 10,
      },
      {
        screenId: amountsScreen.id,
        name: 'gst_no',
        label: 'GST No',
        fieldType: 'TEXT',
        placeholder: 'Enter GST number',
        isRequired: false,
        validationRegex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
        validationMessage: 'Please enter a valid GST number',
        sortOrder: 11,
      },
      {
        screenId: amountsScreen.id,
        name: 'rto_code',
        label: 'RTO Code',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'ts01', label: 'TS01 - Hyderabad East' },
          { value: 'ts02', label: 'TS02 - Hyderabad West' },
          { value: 'ts03', label: 'TS03 - Hyderabad Central' },
          { value: 'ts04', label: 'TS04 - Hyderabad South' },
          { value: 'ts05', label: 'TS05 - Rangareddy' },
          { value: 'ts06', label: 'TS06 - Medak' },
          { value: 'ts07', label: 'TS07 - Warangal' },
          { value: 'ts08', label: 'TS08 - Karimnagar' },
          { value: 'ts09', label: 'TS09 - Secunderabad' },
          { value: 'ts10', label: 'TS10 - Kukatpally' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 12,
      },
      {
        screenId: amountsScreen.id,
        name: 'charger_no',
        label: 'Charger Number',
        fieldType: 'TEXT',
        placeholder: 'Enter charger number',
        isRequired: false,
        sortOrder: 13,
      },
      {
        screenId: amountsScreen.id,
        name: 'rto_fees',
        label: 'RTO Fees',
        fieldType: 'NUMBER',
        placeholder: 'Enter RTO fees amount',
        isRequired: false,
        sortOrder: 14,
      },
      {
        screenId: amountsScreen.id,
        name: 'approval_status',
        label: 'Manager Approval Status',
        fieldType: 'SELECT',
        isRequired: false,
        isReadOnly: true,
        options: JSON.stringify([
          { value: 'na', label: 'N/A - Not Required' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]),
        defaultValue: 'na',
        sortOrder: 15,
      },
    ],
  });

  console.log('✅ Screen 4 created: Amounts & Tax');

  // ============================================
  // SCREEN 5: Insurance, Nominee & Demographics
  // ============================================
  const insuranceScreen = await prisma.screen.upsert({
    where: { code: 'insurance_nominee_demographics' },
    update: {
      requiresInsuranceApproval: true,  // Requires Insurance Executive approval
      requiresApproval: true,            // Also optionally requires Manager approval (can be toggled from CRM)
    },
    create: {
      name: 'Insurance, Nominee & Demographics',
      code: 'insurance_nominee_demographics',
      description: 'Insurance, nominee and demographic details',
      requiresInsuranceApproval: true,  // Requires Insurance Executive approval
      requiresApproval: true,            // Also optionally requires Manager approval (can be toggled from CRM)
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: insuranceScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      // Insurance Details
      {
        screenId: insuranceScreen.id,
        name: 'insurer_name',
        label: 'Insurer Name',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'lic', label: 'LIC' },
          { value: 'hdfc_ergo', label: 'HDFC Ergo' },
          { value: 'icici_lombard', label: 'ICICI Lombard' },
          { value: 'bajaj_allianz', label: 'Bajaj Allianz' },
          { value: 'new_india', label: 'New India Assurance' },
          { value: 'tata_aig', label: 'Tata AIG' },
          { value: 'reliance', label: 'Reliance General' },
          { value: 'sbi_general', label: 'SBI General' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 1,
      },
      {
        screenId: insuranceScreen.id,
        name: 'sale_type',
        label: 'Sale Type',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'new', label: 'New' },
          { value: 'renewal', label: 'Renewal' },
          { value: 'rollover', label: 'Rollover' },
        ]),
        sortOrder: 2,
      },
      {
        screenId: insuranceScreen.id,
        name: 'policy_type',
        label: 'Policy Type',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'comprehensive', label: 'Comprehensive' },
          { value: 'third_party', label: 'Third Party' },
          { value: 'standalone_od', label: 'Standalone OD' },
        ]),
        sortOrder: 3,
      },
      {
        screenId: insuranceScreen.id,
        name: 'idv',
        label: 'IDV (Insured Declared Value)',
        fieldType: 'NUMBER',
        placeholder: 'Enter IDV amount',
        isRequired: true,
        sortOrder: 4,
      },
      {
        screenId: insuranceScreen.id,
        name: 'premium',
        label: 'Premium',
        fieldType: 'NUMBER',
        placeholder: 'Enter premium amount',
        isRequired: true,
        sortOrder: 5,
      },
      {
        screenId: insuranceScreen.id,
        name: 'add_ons',
        label: 'Add-ons',
        fieldType: 'MULTISELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'zero_depreciation', label: 'Zero Depreciation' },
          { value: 'roadside_assistance', label: 'Roadside Assistance' },
          { value: 'engine_protection', label: 'Engine Protection' },
          { value: 'ncb_protection', label: 'NCB Protection' },
          { value: 'key_replacement', label: 'Key Replacement' },
          { value: 'tyre_protection', label: 'Tyre Protection' },
          { value: 'consumables', label: 'Consumables Cover' },
          { value: 'personal_accident', label: 'Personal Accident Cover' },
          { value: 'return_to_invoice', label: 'Return to Invoice' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 6,
      },
      {
        screenId: insuranceScreen.id,
        name: 'policy_start_date',
        label: 'Policy Start Date',
        fieldType: 'DATE',
        isRequired: true,
        sortOrder: 7,
      },
      {
        screenId: insuranceScreen.id,
        name: 'policy_end_date',
        label: 'Policy End Date',
        fieldType: 'DATE',
        isRequired: true,
        sortOrder: 8,
      },
      {
        screenId: insuranceScreen.id,
        name: 'cash_amt',
        label: 'Cash Amount',
        fieldType: 'NUMBER',
        placeholder: 'Enter cash amount',
        isRequired: false,
        sortOrder: 9,
      },
      {
        screenId: insuranceScreen.id,
        name: 'purchase_type',
        label: 'Purchase Type',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'cash', label: 'Cash' },
          { value: 'finance', label: 'Finance' },
          { value: 'exchange', label: 'Exchange' },
        ]),
        sortOrder: 10,
      },
      // Nominee Details
      {
        screenId: insuranceScreen.id,
        name: 'nominee_name',
        label: 'Nominee Name',
        fieldType: 'TEXT',
        placeholder: 'Enter nominee name',
        isRequired: true,
        validationRegex: '^[a-zA-Z\\s]{2,50}$',
        validationMessage: 'Nominee name must contain only letters',
        sortOrder: 11,
      },
      {
        screenId: insuranceScreen.id,
        name: 'nominee_age',
        label: 'Nominee Age',
        fieldType: 'NUMBER',
        placeholder: 'Enter nominee age',
        isRequired: true,
        validationRegex: '^[1-9][0-9]?$|^100$',
        validationMessage: 'Age must be between 1 and 100',
        sortOrder: 12,
      },
      {
        screenId: insuranceScreen.id,
        name: 'nominee_relation',
        label: 'Nominee Relation',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'spouse', label: 'Spouse' },
          { value: 'father', label: 'Father' },
          { value: 'mother', label: 'Mother' },
          { value: 'son', label: 'Son' },
          { value: 'daughter', label: 'Daughter' },
          { value: 'brother', label: 'Brother' },
          { value: 'sister', label: 'Sister' },
          { value: 'other', label: 'Other' },
        ]),
        sortOrder: 13,
      },
      // Demographics
      {
        screenId: insuranceScreen.id,
        name: 'nationality',
        label: 'Nationality',
        fieldType: 'SELECT',
        isRequired: true,
        options: JSON.stringify([
          { value: 'indian', label: 'Indian' },
          { value: 'nri', label: 'NRI' },
          { value: 'foreign', label: 'Foreign National' },
        ]),
        sortOrder: 14,
      },
      {
        screenId: insuranceScreen.id,
        name: 'qualification',
        label: 'Qualification',
        fieldType: 'SELECT',
        isRequired: false,
        options: JSON.stringify([
          { value: 'below_10', label: 'Below 10th' },
          { value: '10th', label: '10th Pass' },
          { value: '12th', label: '12th Pass' },
          { value: 'graduate', label: 'Graduate' },
          { value: 'post_graduate', label: 'Post Graduate' },
          { value: 'doctorate', label: 'Doctorate' },
          { value: 'professional', label: 'Professional Degree' },
        ]),
        sortOrder: 15,
      },
    ],
  });

  console.log('✅ Screen 5 created: Insurance, Nominee & Demographics');

  // ============================================
  // SCREEN 6: Invoice (Read-only, Print after Approval)
  // ============================================
  const invoiceScreen = await prisma.screen.upsert({
    where: { code: 'invoice' },
    update: {
      requiresApproval: false,
      isPostApproval: true, // Only accessible after full approval (insurance + manager if configured)
    },
    create: {
      name: 'Invoice',
      code: 'invoice',
      description: 'Invoice generation - Available after full approval',
      requiresApproval: false,
      isPostApproval: true,
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: invoiceScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      // Invoice Header
      {
        screenId: invoiceScreen.id,
        name: 'invoice_number',
        label: 'Invoice Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        defaultValue: 'Auto-generated',
        sortOrder: 1,
      },
      {
        screenId: invoiceScreen.id,
        name: 'invoice_date',
        label: 'Invoice Date',
        fieldType: 'DATE',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 2,
      },
      // Customer Details (fetched from customer_enquiry)
      {
        screenId: invoiceScreen.id,
        name: 'customer_name',
        label: 'Customer Name',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 3,
      },
      {
        screenId: invoiceScreen.id,
        name: 'customer_mobile',
        label: 'Mobile Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 4,
      },
      {
        screenId: invoiceScreen.id,
        name: 'customer_address',
        label: 'Address',
        fieldType: 'TEXTAREA',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 5,
      },
      // Vehicle Details (fetched from vehicle_details)
      {
        screenId: invoiceScreen.id,
        name: 'vehicle_brand',
        label: 'Brand',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 6,
      },
      {
        screenId: invoiceScreen.id,
        name: 'vehicle_model',
        label: 'Model',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 7,
      },
      {
        screenId: invoiceScreen.id,
        name: 'vehicle_variant',
        label: 'Variant',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 8,
      },
      {
        screenId: invoiceScreen.id,
        name: 'vehicle_color',
        label: 'Color',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 9,
      },
      {
        screenId: invoiceScreen.id,
        name: 'chassis_number',
        label: 'Chassis Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 10,
      },
      {
        screenId: invoiceScreen.id,
        name: 'engine_number',
        label: 'Engine Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 11,
      },
      // Amount Details (fetched from amounts_tax)
      {
        screenId: invoiceScreen.id,
        name: 'base_amount',
        label: 'Base Amount',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 12,
      },
      {
        screenId: invoiceScreen.id,
        name: 'other_charges',
        label: 'Other Charges',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 13,
      },
      {
        screenId: invoiceScreen.id,
        name: 'discount_amount',
        label: 'Discount',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 14,
      },
      {
        screenId: invoiceScreen.id,
        name: 'tax_amount',
        label: 'Tax Amount',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 15,
      },
      {
        screenId: invoiceScreen.id,
        name: 'total_amount',
        label: 'Total Amount',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 16,
      },
      {
        screenId: invoiceScreen.id,
        name: 'payment_mode',
        label: 'Payment Mode',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 17,
      },
      // Insurance Details
      {
        screenId: invoiceScreen.id,
        name: 'insurance_provider',
        label: 'Insurance Provider',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 18,
      },
      {
        screenId: invoiceScreen.id,
        name: 'insurance_premium',
        label: 'Insurance Premium',
        fieldType: 'NUMBER',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 19,
      },
    ],
  });

  console.log('✅ Screen 6 created: Invoice');

  // ============================================
  // SCREEN 7: Gate Pass (Read-only, Print after Approval)
  // ============================================
  const gatePassScreen = await prisma.screen.upsert({
    where: { code: 'gate_pass' },
    update: {
      requiresApproval: false,
      isPostApproval: true, // Only accessible after full approval (insurance + manager if configured)
    },
    create: {
      name: 'Gate Pass',
      code: 'gate_pass',
      description: 'Gate pass generation - Available after full approval',
      requiresApproval: false,
      isPostApproval: true,
    },
  });

  await prisma.screenField.deleteMany({
    where: { screenId: gatePassScreen.id },
  });

  await prisma.screenField.createMany({
    data: [
      // Gate Pass Header
      {
        screenId: gatePassScreen.id,
        name: 'gate_pass_number',
        label: 'Gate Pass Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        defaultValue: 'Auto-generated',
        sortOrder: 1,
      },
      {
        screenId: gatePassScreen.id,
        name: 'gate_pass_date',
        label: 'Date',
        fieldType: 'DATE',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 2,
      },
      {
        screenId: gatePassScreen.id,
        name: 'gate_pass_time',
        label: 'Time',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 3,
      },
      // Customer Details
      {
        screenId: gatePassScreen.id,
        name: 'customer_name',
        label: 'Customer Name',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 4,
      },
      {
        screenId: gatePassScreen.id,
        name: 'customer_mobile',
        label: 'Mobile Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 5,
      },
      // Vehicle Details
      {
        screenId: gatePassScreen.id,
        name: 'vehicle_brand',
        label: 'Brand',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 6,
      },
      {
        screenId: gatePassScreen.id,
        name: 'vehicle_model',
        label: 'Model',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 7,
      },
      {
        screenId: gatePassScreen.id,
        name: 'vehicle_color',
        label: 'Color',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 8,
      },
      {
        screenId: gatePassScreen.id,
        name: 'chassis_number',
        label: 'Chassis Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 9,
      },
      {
        screenId: gatePassScreen.id,
        name: 'engine_number',
        label: 'Engine Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 10,
      },
      {
        screenId: gatePassScreen.id,
        name: 'registration_number',
        label: 'Registration Number',
        fieldType: 'TEXT',
        isRequired: false,
        isReadOnly: true,
        sortOrder: 11,
      },
      // Checklist Items
      {
        screenId: gatePassScreen.id,
        name: 'checklist_documents',
        label: 'Documents Handed Over',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 12,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_keys',
        label: 'Keys Handed Over (2 Sets)',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 13,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_toolkit',
        label: 'Tool Kit Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 14,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_spare_wheel',
        label: 'Spare Wheel Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 15,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_insurance_copy',
        label: 'Insurance Copy Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 16,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_rc_applied',
        label: 'RC Applied / Temporary RC Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 17,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_pollution_certificate',
        label: 'Pollution Certificate Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 18,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_owners_manual',
        label: "Owner's Manual Provided",
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 19,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_service_booklet',
        label: 'Service Booklet Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 20,
      },
      {
        screenId: gatePassScreen.id,
        name: 'checklist_warranty_card',
        label: 'Warranty Card Provided',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 21,
      },
      // Signatures
      {
        screenId: gatePassScreen.id,
        name: 'customer_signature',
        label: 'Customer Acknowledgement',
        fieldType: 'CHECKBOX',
        isRequired: false,
        sortOrder: 22,
      },
      {
        screenId: gatePassScreen.id,
        name: 'delivery_executive',
        label: 'Delivery Executive Name',
        fieldType: 'TEXT',
        isRequired: false,
        sortOrder: 23,
      },
      {
        screenId: gatePassScreen.id,
        name: 'remarks',
        label: 'Remarks',
        fieldType: 'TEXTAREA',
        placeholder: 'Any additional remarks',
        isRequired: false,
        sortOrder: 24,
      },
    ],
  });

  console.log('✅ Screen 7 created: Gate Pass');

  // ============================================
  // CREATE FLOW: Vehicle Sales Flow
  // ============================================
  
  // First, delete existing flow screens and assignments for clean re-seed
  const existingFlow = await prisma.flow.findUnique({
    where: { code: 'VEHICLE_SALES' },
  });
  
  if (existingFlow) {
    await prisma.flowScreen.deleteMany({
      where: { flowId: existingFlow.id },
    });
    await prisma.flowAssignment.deleteMany({
      where: { flowId: existingFlow.id },
    });
  }

  const vehicleSalesFlow = await prisma.flow.upsert({
    where: { code: 'VEHICLE_SALES' },
    update: {
      name: 'Vehicle Sales',
      description: 'Complete vehicle sales and registration flow',
    },
    create: {
      name: 'Vehicle Sales',
      code: 'VEHICLE_SALES',
      description: 'Complete vehicle sales and registration flow',
    },
  });

  // Add screens to flow as tabs in order
  await prisma.flowScreen.createMany({
    data: [
      {
        flowId: vehicleSalesFlow.id,
        screenId: customerEnquiryScreen.id,
        tabOrder: 0,
        tabName: 'Customer & Enquiry',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: addressScreen.id,
        tabOrder: 1,
        tabName: 'Address & Details',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: vehicleScreen.id,
        tabOrder: 2,
        tabName: 'Vehicle Details',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: amountsScreen.id,
        tabOrder: 3,
        tabName: 'Amounts & Tax',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: insuranceScreen.id,
        tabOrder: 4,
        tabName: 'Insurance & Nominee',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: invoiceScreen.id,
        tabOrder: 5,
        tabName: 'Invoice',
      },
      {
        flowId: vehicleSalesFlow.id,
        screenId: gatePassScreen.id,
        tabOrder: 6,
        tabName: 'Gate Pass',
      },
    ],
  });

  // Assign flow to branch
  await prisma.flowAssignment.create({
    data: {
      flowId: vehicleSalesFlow.id,
      branchId: branch.id,
      accessibleByManager: true,
      accessibleByAssociate: true,
      accessibleByViewer: true,
    },
  });

  console.log('✅ Flow created: Vehicle Sales with 7 tabs');

  // ============================================
  // CLEANUP: Delete old sample screens/flow
  // ============================================
  const oldFlow = await prisma.flow.findUnique({
    where: { code: 'CUSTOMER_ONBOARDING' },
  });
  
  if (oldFlow) {
    await prisma.flowScreen.deleteMany({
      where: { flowId: oldFlow.id },
    });
    await prisma.flowAssignment.deleteMany({
      where: { flowId: oldFlow.id },
    });
    await prisma.flow.delete({
      where: { code: 'CUSTOMER_ONBOARDING' },
    });
    console.log('✅ Cleaned up old sample flow');
  }

  // Delete old sample screens
  await prisma.screenField.deleteMany({
    where: { screen: { code: { in: ['CUSTOMER_INFO', 'ADDRESS_INFO'] } } },
  });
  await prisma.screen.deleteMany({
    where: { code: { in: ['CUSTOMER_INFO', 'ADDRESS_INFO'] } },
  });

  // ============================================
  // VEHICLE CATALOG - Seed sample data for cascading dropdowns
  // ============================================
  console.log('\n🚗 Seeding Vehicle Catalog...');
  
  // Delete existing vehicle catalog entries for this branch
  await prisma.vehicleCatalog.deleteMany({
    where: { branchId: branch.id },
  });

  // Add sample vehicle catalog data
  await prisma.vehicleCatalog.createMany({
    data: [
      { branchId: branch.id, brand: 'Maruti Suzuki', model: 'Swift', variant: 'ZXi Plus', colour: 'Pearl Arctic White', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Hyundai', model: 'Creta', variant: 'SX (O)', colour: 'Titan Grey', fuelType: 'Diesel' },
      { branchId: branch.id, brand: 'Tata', model: 'Nexon', variant: 'Fearless Plus', colour: 'Daytona Grey', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Mahindra', model: 'XUV 7XO', variant: 'AX7 L', colour: 'Everest White', fuelType: 'Diesel' },
      { branchId: branch.id, brand: 'Kia', model: 'Seltos', variant: 'HTX Plus', colour: 'Aurora Black Pearl', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Toyota', model: 'Fortuner', variant: 'Legender 4x4 AT', colour: 'Platinum White Pearl', fuelType: 'Diesel' },
      { branchId: branch.id, brand: 'Skoda', model: 'Kushaq', variant: 'Style 1.5 TSI', colour: 'Carbon Steel', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Honda', model: 'City', variant: 'ZX CVT', colour: 'Radiant Red Metallic', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Renault', model: 'Triber', variant: 'RXZ', colour: 'Moonlight Silver', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Tata', model: 'Punch', variant: 'Creative', colour: 'Tropical Mist', fuelType: 'Petrol' },
      { branchId: branch.id, brand: 'Tata', model: 'Nexon EV', variant: 'Empowered Plus LR', colour: 'Ocean Blue', fuelType: 'Electric' },
      { branchId: branch.id, brand: 'MG', model: 'ZS EV', variant: 'Exclusive', colour: 'Pearl White', fuelType: 'Electric' },
      { branchId: branch.id, brand: 'Hyundai', model: 'Kona Electric', variant: 'Premium', colour: 'Polar White', fuelType: 'Electric' },
      { branchId: branch.id, brand: 'Maruti Suzuki', model: 'Dzire', variant: 'VXi CNG', colour: 'Magma Grey', fuelType: 'CNG' },
      { branchId: branch.id, brand: 'Tata', model: 'Tigor', variant: 'XZ CNG', colour: 'Arizona Blue', fuelType: 'CNG' },
      { branchId: branch.id, brand: 'Hyundai', model: 'Aura', variant: 'SX CNG', colour: 'Typhoon Silver', fuelType: 'CNG' },
    ],
  });

  console.log('✅ Vehicle Catalog seeded: 16 entries for Main Branch');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Screens Created:');
  console.log('   1. Customer & Enquiry (11 fields)');
  console.log('   2. Address and More Details (15 fields)');
  console.log('   3. Vehicle Details (12 fields)');
  console.log('   4. Amounts & Tax (15 fields)');
  console.log('   5. Insurance, Nominee & Demographics (15 fields)');
  console.log('   6. Invoice (19 fields) - Print after approval');
  console.log('   7. Gate Pass (24 fields) - Print after approval');
  console.log('\n📝 Flow Created: Vehicle Sales');
  console.log('   Tabs: Customer & Enquiry → Address & Details → Vehicle Details → Amounts & Tax → Insurance & Nominee → Invoice → Gate Pass');
  console.log('   Note: Invoice & Gate Pass tabs are only accessible after manager approval');
  console.log('\n🔐 Login credentials:');
  console.log('   SuperAdmin: /admin/login - superadmin / Superadmin@123');
  console.log('   Users: /login');
  console.log('     Manager: manager1 / Manager@123');
  console.log('     Associate: associate1 / Associate@123');
  console.log('     Viewer: viewer1 / Viewer@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
