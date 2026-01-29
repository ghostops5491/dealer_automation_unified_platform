import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, GitBranch, Users, Workflow, FileText, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { organizationApi, branchApi, userApi, flowApi, formApi } from '@/lib/api';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  href,
  onClick,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: React.ElementType;
  color: string;
  href?: string;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      navigate(href);
    }
  };

  return (
    <Card 
      className={`hover:shadow-lg transition-all duration-200 ${href || onClick ? 'cursor-pointer hover:scale-[1.02] hover:border-primary/50' : ''}`}
      onClick={handleClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          {(href || onClick) && (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const navigate = useNavigate();
  
  const { data: orgs } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationApi.getAll(),
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchApi.getAll(),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });

  const { data: flows } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.getAll(),
  });

  const { data: submissions } = useQuery({
    queryKey: ['submissions'],
    queryFn: () => formApi.getAll(),
  });

  const orgCount = orgs?.data?.data?.length || 0;
  const branchCount = branches?.data?.data?.length || 0;
  const userCount = users?.data?.data?.length || 0;
  const flowCount = flows?.data?.data?.length || 0;
  const submissionData = submissions?.data?.data || [];
  
  const pendingCount = submissionData.filter((s: any) => s.status === 'PENDING_APPROVAL').length;
  const approvedCount = submissionData.filter((s: any) => s.status === 'APPROVED').length;
  const rejectedCount = submissionData.filter((s: any) => s.status === 'REJECTED').length;

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the CRM Admin Panel</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          title="Organizations"
          value={orgCount}
          description="Total registered organizations"
          icon={Building2}
          color="bg-blue-500"
          href="/admin/organizations"
        />
        <StatCard
          title="Branches"
          value={branchCount}
          description="Total active branches"
          icon={GitBranch}
          color="bg-purple-500"
          href="/admin/branches"
        />
        <StatCard
          title="Users"
          value={userCount}
          description="Total registered users"
          icon={Users}
          color="bg-green-500"
          href="/admin/users"
        />
        <StatCard
          title="Flows"
          value={flowCount}
          description="Total configured flows"
          icon={Workflow}
          color="bg-orange-500"
          href="/admin/flows"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card 
          className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:border-yellow-500/50"
          onClick={() => navigate('/admin/submissions')}
        >
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div className="flex-1">
              <CardTitle className="text-lg">Pending Approvals</CardTitle>
              <CardDescription>Submissions waiting for review</CardDescription>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>

        <Card 
          className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:border-green-500/50"
          onClick={() => navigate('/admin/submissions')}
        >
          <CardHeader className="flex flex-row items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <CardTitle className="text-lg">Approved</CardTitle>
              <CardDescription>Successfully approved submissions</CardDescription>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600">{approvedCount}</div>
          </CardContent>
        </Card>

        <Card 
          className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:border-red-500/50"
          onClick={() => navigate('/admin/submissions')}
        >
          <CardHeader className="flex flex-row items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <CardTitle className="text-lg">Rejected</CardTitle>
              <CardDescription>Rejected submissions</CardDescription>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-600">{rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks you might want to perform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div
              onClick={() => navigate('/admin/organizations')}
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-secondary hover:border-blue-500/50 transition-all cursor-pointer"
            >
              <Building2 className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <p className="font-medium">New Organization</p>
                <p className="text-sm text-muted-foreground">Create organization</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              onClick={() => navigate('/admin/branches')}
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-secondary hover:border-purple-500/50 transition-all cursor-pointer"
            >
              <GitBranch className="h-5 w-5 text-purple-500" />
              <div className="flex-1">
                <p className="font-medium">New Branch</p>
                <p className="text-sm text-muted-foreground">Add a branch</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              onClick={() => navigate('/admin/users')}
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-secondary hover:border-green-500/50 transition-all cursor-pointer"
            >
              <Users className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <p className="font-medium">New User</p>
                <p className="text-sm text-muted-foreground">Create user account</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              onClick={() => navigate('/admin/screens')}
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-secondary hover:border-orange-500/50 transition-all cursor-pointer"
            >
              <FileText className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <p className="font-medium">New Screen</p>
                <p className="text-sm text-muted-foreground">Build a form screen</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

