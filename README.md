# CRM System - Vehicle Sales Management

A full-featured Customer Relationship Management system with hierarchical organization structure, dynamic form builder, multi-level approval workflows, and document generation.

## 🚀 Quick Start (For Testing)

### Prerequisites
- **Docker Desktop** installed and running
- **Git** (to clone the repository)

### One-Command Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd crm

# 2. Start all services (database, backend, frontend)
docker-compose up -d --build

# 3. Wait ~30 seconds for services to start, then seed the database
docker-compose exec backend npx prisma db push
docker-compose exec backend npm run prisma:seed
```

### Access the Application

| URL | Description |
|-----|-------------|
| http://localhost:5173/login | User Login (Manager, Associate, Viewer, Insurance Executive) |
| http://localhost:5173/admin/login | Superadmin Login |

### Default Login Credentials

| Role | Username | Password | Access |
|------|----------|----------|--------|
| **Super Admin** | superadmin | Superadmin@123 | `/admin/login` - Full system access |
| **Manager** | manager1 | Manager@123 | `/login` - Approve forms, view all branch data |
| **Associate** | associate1 | Associate@123 | `/login` - Fill and submit forms |
| **Viewer** | viewer1 | Viewer@123 | `/login` - Read-only access |
| **Insurance Executive** | *(create via admin)* | *(set by admin)* | `/login` - Approve insurance details |

### Stop the Application

```bash
docker-compose down
```

### View Logs (if something isn't working)

```bash
docker-compose logs -f
```

---

## 📋 Features

### 🏢 Organization Hierarchy
- **Organizations** → **Branches** → **Users**
- Organization details: Logo, Legal Name, GST, PAN, Address
- Branch details: Address, Invoice Address, Role validity timelines

### 👥 Role-Based Access Control
- **Superadmin**: Full system access, manage everything
- **Manager**: Approve/reject forms, view all branch submissions
- **Associate**: Fill forms, submit for approval
- **Viewer**: Read-only access to forms
- **Insurance Executive**: Edit/approve insurance details

### ⏰ Timeline & Validity Management
- Set expiry dates for each role per branch
- Individual user validity override
- Automatic login restriction after expiry
- Expired users see clear error message

### 📝 Dynamic Screen Builder
- Create custom form screens with various field types
- Field types: Text, Textarea, Number, Email, Phone, Date, Select, Multiselect, Checkbox, Radio, File/Image Upload
- Regex validation with custom error messages
- Conditional fields (show/hide based on other field values)
- Role-based field visibility and editability

### 🔄 Flow Builder
- Combine screens into sequential tab-based workflows
- Assign flows to branches with role-specific access
- Current flow: Vehicle Sales (7 screens)

### ✅ Multi-Level Approval Workflow
1. **Associate** fills and submits form
2. **Insurance Executive** reviews/edits insurance screen → Approves/Rejects
3. **Manager** does final approval (if configured) → Approves/Rejects
4. **Invoice & Gate Pass** become available for printing after full approval

### 📄 Document Generation
- **Invoice**: Auto-generated with customer, vehicle, and amount details
- **Gate Pass**: Delivery checklist with all vehicle information
- Preview available at any stage, Print only after approval

### 📊 History & Analytics
- View complete form history (who did what, when)
- Dashboard with submission statistics
- Charts showing daily/weekly/monthly trends

### 📁 File Uploads
- Upload documents: PAN, Aadhaar, GST Certificate, Address Proof
- Supported formats: PDF, JPEG, PNG
- Maximum file size: 4MB

---

## 🏗️ Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js + Express + TypeScript |
| **ORM** | Prisma |
| **Database** | PostgreSQL 15 |
| **Frontend** | React 18 + TypeScript + Vite |
| **UI Library** | shadcn/ui + Tailwind CSS |
| **State** | Zustand + React Query |
| **Auth** | JWT + bcrypt |
| **Containerization** | Docker + Docker Compose |

### Project Structure

```
crm/
├── backend/
│   ├── src/
│   │   ├── controllers/    # API logic
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth, validation
│   │   └── types/          # TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Sample data
│   └── uploads/            # Uploaded files
├── frontend/
│   ├── src/
│   │   ├── pages/          # React pages
│   │   ├── components/     # UI components
│   │   ├── lib/            # API client, utilities
│   │   └── store/          # Zustand stores
│   └── nginx.conf          # Production config
├── docker-compose.yml
└── README.md
```

---

## 🧪 Testing the Application

### Test Flow: Complete Vehicle Sale

1. **Login as Associate** (`associate1` / `Associate@123`)
2. Go to **My Flows** → Click **Start** on "Vehicle Sales"
3. Fill each tab and click **Next**:
   - Customer & Enquiry
   - Address and Details
   - Vehicle Details
   - Amounts & Tax
   - Insurance & Nominee
4. Click **Submit for Approval**

5. **Login as Insurance Executive** (create one first via Superadmin)
6. Go to **Insurance Approvals** → Review and **Approve**

7. **Login as Manager** (`manager1` / `Manager@123`)
8. Go to **Approvals** → Review and **Approve**

9. **Go back to the form** → **Invoice** and **Gate Pass** tabs are now printable!

### Create an Insurance Executive User

1. Login as Superadmin at `/admin/login`
2. Go to **Users** → Click **Add User**
3. Fill details and select role: **Insurance Executive**
4. Assign to a branch (e.g., "Main Branch")

---

## 🔧 Advanced Configuration

For full production deployment steps (Docker CRM + Windows Playwright job runner), see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

For complete system architecture, TVS API reference, Playwright details, and database schema, see **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)**.

### Environment Variables

Create a `.env` file in the root directory (for local development without Docker):

```env
# Backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_db"
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_EXPIRES_IN="8h"
PORT=3001
NODE_ENV=development

# Frontend (in frontend/.env)
VITE_API_URL=http://localhost:3001/api
```

### Local Development (Without Docker)

```bash
# Terminal 1: Start PostgreSQL (or use existing)
# Make sure PostgreSQL is running on port 5432

# Terminal 2: Backend
cd backend
npm install
cp .env.example .env  # Edit with your database URL
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run dev

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
```

### Reset Database

```bash
# With Docker
docker-compose down -v  # Removes volumes (database data)
docker-compose up -d --build
docker-compose exec backend npx prisma db push
docker-compose exec backend npm run prisma:seed

# Without Docker
npx prisma db push --force-reset
npm run prisma:seed
```

---

## 📱 Screen Configuration (Vehicle Sales Flow)

| # | Screen | Fields | Special Features |
|---|--------|--------|------------------|
| 1 | Customer & Enquiry | Enquiry No, Ownership Type, Name, Mobile, etc. | Ownership type affects later screens |
| 2 | Address & Details | Address, City, State, PAN, Aadhaar, GST | Conditional: Individual shows Aadhaar, Company shows GST |
| 3 | Vehicle Details | Chassis, Engine, Model, Variant, Color, Brand, Fuel Type | Dropdown selections |
| 4 | Amounts & Tax | Base Amount, Tax, Discount, Payment Mode, RTO Fees | Auto-calculations |
| 5 | Insurance & Nominee | Insurer, Policy Type, IDV, Premium, Nominee details | **Requires Insurance Executive Approval** |
| 6 | Invoice | Auto-populated from all screens | **Post-approval only**, Read-only, Printable |
| 7 | Gate Pass | Vehicle checklist, delivery details | **Post-approval only**, Read-only, Printable |

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Connection refused" on login | Wait 30 seconds after `docker-compose up`, database needs to initialize |
| "Flow not found" when starting form | Make sure you ran the seed command |
| Can't upload files | Check file size (max 4MB) and format (PDF, JPEG, PNG) |
| Insurance Executive can't view forms | Update to latest version - this was fixed |
| Toast messages disappear quickly | They now stay for 3 minutes |

### Check Service Status

```bash
docker-compose ps
```

All 3 services should show "Up":
- `crm-postgres`
- `crm-backend`
- `crm-frontend`

### View Detailed Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

---

## 📞 Support

If you encounter issues:
1. Check the logs (`docker-compose logs -f`)
2. Make sure all containers are running (`docker-compose ps`)
3. Try resetting the database (see above)
4. Ensure Docker Desktop is running with enough memory (at least 4GB recommended)

---

## License

MIT
