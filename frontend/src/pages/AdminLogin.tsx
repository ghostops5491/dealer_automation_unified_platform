import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function AdminLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await authApi.loginSuperAdmin(data.username, data.password);

      if (response.data.success) {
        const { token, user } = response.data.data;
        login(token, user);
        toast({
          title: 'Login successful',
          description: 'Welcome back, Administrator',
        });
        navigate('/admin');
      }
    } catch (error: any) {
      toast({
        title: 'Authentication failed',
        description: 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-neutral-900 to-zinc-900 p-4">
      {/* Minimal background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_100%)]" />

      <Card className="w-full max-w-sm relative bg-zinc-900/80 backdrop-blur-xl shadow-2xl border border-zinc-800">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-medium text-zinc-200">
            Administration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-zinc-400 text-sm">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                {...register('username')}
                className="h-10 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-zinc-600"
              />
              {errors.username && (
                <p className="text-sm text-red-400">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-400 text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="h-10 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-zinc-600"
              />
              {errors.password && (
                <p className="text-sm text-red-400">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-10 mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Authenticate'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

