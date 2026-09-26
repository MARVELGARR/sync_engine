"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Zap, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/use-auth-store";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/avatar";

const schema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Enter a valid email address").max(255)),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must contain at least one letter and one number",
    }),
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const registerUser = useAuthStore((s) => s.register);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);

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
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await registerUser(v.email, v.password, v.displayName);
      toast.success("Account created — welcome!");
      router.push("/documents");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Registration failed. Try again.";
      setServerError(msg);
    }
  });

  return (
    <Card className="w-full max-w-md border-brand-100 shadow-lg shadow-brand-100">
      <CardHeader className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow">
          <Zap className="size-5" />
        </span>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Start collaborating in seconds.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {serverError && <Alert variant="destructive">{serverError}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" autoComplete="name" placeholder="Ada Lovelace" {...register("displayName")} />
            {formState.errors.displayName && <p className="text-xs text-red-600">{formState.errors.displayName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
            {formState.errors.email && <p className="text-xs text-red-600">{formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" placeholder="8+ characters, letters & numbers" {...register("password")} />
            {formState.errors.password && <p className="text-xs text-red-600">{formState.errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Create account
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
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
