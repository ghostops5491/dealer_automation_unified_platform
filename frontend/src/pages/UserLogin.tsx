import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Users, AlertCircle, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function UserLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isExpiredError, setIsExpiredError] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setLoginError(null);
    setIsExpiredError(false);
    
    try {
      const response = await authApi.loginUser(data.username, data.password);

      if (response.data.success) {
        const { token, user } = response.data.data;
        login(token, user);
        toast({
          title: 'Login successful',
          description: `Welcome back, ${user.firstName || user.username}!`,
        });
        navigate('/dashboard');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Invalid credentials';
      
      // Check if it's an expiry-related error
      const isExpiry = errorMessage.toLowerCase().includes('expired') || 
                       errorMessage.toLowerCase().includes('inactive');
      
      setLoginError(errorMessage);
      setIsExpiredError(isExpiry);
      
      toast({
        title: isExpiry ? 'Access Expired' : 'Login failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />
      
      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative bg-white/95 backdrop-blur-xl shadow-2xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-lg">
            <Users className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            CRM Portal
          </CardTitle>
          <CardDescription>Sign in to access your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Error Banner */}
          {loginError && (
            <div className={`mb-4 p-4 rounded-lg border ${
              isExpiredError 
                ? 'bg-amber-50 border-amber-200 text-amber-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <div className="flex items-start gap-3">
                {isExpiredError ? (
                  <ShieldX className="h-5 w-5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium">
                    {isExpiredError ? 'Access Expired' : 'Login Failed'}
                  </p>
                  <p className="text-sm mt-1 opacity-90">{loginError}</p>
                  {isExpiredError && (
                    <p className="text-xs mt-2 opacity-75">
                      Please contact your system administrator to renew your access.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(onSubmit)(e);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
                autoComplete="username"
                {...register('username')}
                className="h-11"
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                {...register('password')}
                className="h-11"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 mt-2 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Contact your administrator if you need access
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

