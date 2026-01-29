import { Link, useLocation } from 'react-router-dom';
import {
  Building2,
  GitBranch,
  Users,
  LayoutGrid,
  Workflow,
  FileText,
  ClipboardCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Home,
  History,
  BarChart3,
  MapPin,
  ShieldCheck,
  Cog,
  Car,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import { Separator } from '@/components/ui/separator';

const superAdminNavItems = [
  { icon: Home, label: 'Dashboard', path: '/admin' },
  { icon: Building2, label: 'Organizations', path: '/admin/organizations' },
  { icon: GitBranch, label: 'Branches', path: '/admin/branches' },
  { icon: Users, label: 'Users', path: '/admin/users' },
  { icon: LayoutGrid, label: 'Screens', path: '/admin/screens' },
  { icon: Workflow, label: 'Flows', path: '/admin/flows' },
  { icon: FileText, label: 'Submissions', path: '/admin/submissions' },
];

const userNavItems = [
  { icon: Home, label: 'Dashboard', path: '/dashboard' },
  { icon: Workflow, label: 'My Flows', path: '/dashboard/flows' },
  { icon: FileText, label: 'My Submissions', path: '/dashboard/submissions' },
  { icon: ShieldCheck, label: 'Insurance Approvals', path: '/dashboard/insurance-approvals', roles: ['INSURANCE_EXECUTIVE'] },
  { icon: ClipboardCheck, label: 'Approvals', path: '/dashboard/approvals', roles: ['MANAGER'] },
  { icon: Cog, label: 'Run Job', path: '/dashboard/run-job', roles: ['MANAGER'], allowAssociateOverride: true },
  { icon: Car, label: 'Vehicle Catalog', path: '/dashboard/vehicle-catalog', roles: ['MANAGER'] },
  { icon: History, label: 'History', path: '/dashboard/history', roles: ['MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'] },
  { icon: BarChart3, label: 'Analytics', path: '/dashboard/analytics', roles: ['MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'] },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperAdmin = user?.type === 'superadmin';
  const branchAllowsAssociateJobs = (user?.branch as any)?.allowAssociateJobs ?? false;
  
  const navItems = isSuperAdmin
    ? superAdminNavItems
    : userNavItems.filter((item) => {
        // Check if item has allowAssociateOverride and user is Associate with branch permission
        if (item.allowAssociateOverride && user?.role === 'ASSOCIATE' && branchAllowsAssociateJobs) {
          return true;
        }
        // Standard role check
        return !item.roles || (user?.role && item.roles.includes(user.role));
      });

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header with collapse button */}
        <div className="relative flex h-14 items-center justify-between border-b px-3">
          {!collapsed && (
            <span className="font-semibold text-lg">
              {isSuperAdmin ? 'CRM Admin' : 'CRM Portal'}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("h-8 w-8 flex-shrink-0", collapsed ? "mx-auto" : "")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        
        {/* Organization Logo & Info for non-superadmin users */}
        {!isSuperAdmin && !collapsed && (
          <div className="px-4 py-4 border-b bg-gradient-to-b from-secondary/50 to-transparent">
            {/* Logo - Large and centered */}
            <div className="flex justify-center mb-3">
              {user?.organization?.logo ? (
                <img 
                  src={user.organization.logo} 
                  alt={user.organization.name || 'Organization'}
                  className="h-16 w-16 rounded-xl object-cover border-2 border-border shadow-sm"
                  onError={(e) => {
                    // Fallback if image fails to load
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={cn(
                "flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-2xl shadow-sm",
                user?.organization?.logo ? "hidden" : ""
              )}>
                {user?.organization?.name ? user.organization.name.charAt(0) : 'O'}
              </div>
            </div>
            
            {/* Organization Name */}
            <h3 className="text-center font-semibold text-base truncate">
              {user?.organization?.name || 'Organization'}
            </h3>
            
            {/* Branch Info */}
            {user?.branch && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{user.branch.name}</span>
                </div>
                {user.branch.address && (
                  <div className="flex items-start gap-2 mt-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{user.branch.address}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Collapsed view - show small logo */}
        {!isSuperAdmin && collapsed && (
          <div className="py-3 border-b flex justify-center">
            {user?.organization?.logo ? (
              <img 
                src={user.organization.logo} 
                alt={user.organization.name || 'Organization'}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                {user?.organization?.name ? user.organization.name.charAt(0) : 'O'}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* User Info & Logout */}
        <div className="p-2">
          {!collapsed && (
            <div className="mb-2 rounded-lg bg-secondary/50 p-3">
              <p className="text-sm font-medium truncate">
                {user?.firstName
                  ? `${user.firstName} ${user.lastName || ''}`
                  : user?.username}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {user?.type === 'superadmin' ? 'Super Admin' : user?.role?.toLowerCase()}
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10',
              collapsed && 'justify-center px-0'
            )}
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}


