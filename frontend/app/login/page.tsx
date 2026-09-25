"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/site-header";
import { Zap, Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await login(v.email, v.password);
      toast.success("Welcome back!");
      router.push("/documents");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Login failed. Try again.";
      setServerError(msg);
    }
  });

  const onGuest = async () => {
    setServerError(null);
    setGuestLoading(true);
    try {
      await loginAsGuest();
      toast.success("Continuing as guest — create an account to keep your work.");
      router.push("/documents");
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "Could not start guest session.");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="workspace-bg min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14">
        <Card className="w-full max-w-md border-brand-100 shadow-lg shadow-brand-100">
          <CardHeader className="text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow">
              <Zap className="size-5" />
            </span>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Log in to your collaborative workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {serverError && <Alert variant="destructive">{serverError}</Alert>}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
                {formState.errors.email && <p className="text-xs text-red-600">{formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...register("password")} />
                {formState.errors.password && <p className="text-xs text-red-600">{formState.errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
                {formState.isSubmitting && <Loader2 className="animate-spin" />}
                Log in
              </Button>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={onGuest} disabled={guestLoading || formState.isSubmitting}>
                {guestLoading && <Loader2 className="animate-spin" />}
                Continue as guest
              </Button>
              <p className="text-center text-sm text-slate-500">
                No account?{" "}
                <Link href="/register" className="font-semibold text-brand-700 hover:underline">
                  Create one
                </Link>
              </p>
              <p className="text-center text-xs text-slate-400">
                Guests can create and edit documents. Sharing needs a free account.
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
