"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/avatar";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email("Enter a valid email address").max(255)),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must contain at least one letter and one number",
    }),
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(100).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function ClaimAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const claimGuest = useAuthStore((s) => s.claimGuest);
  const user = useAuthStore((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: user?.displayName ?? "" },
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await claimGuest(v.email, v.password, v.displayName?.trim() ? v.displayName : undefined);
      toast.success("Account created — your documents are safe!");
      reset();
      onOpenChange(false);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "Could not create account. Try again.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Keep your work — create an account</DialogTitle>
        <DialogDescription>
          Guest sessions expire after 7 days. Claim yours now: your documents carry over, and you unlock sharing.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        {serverError && <Alert variant="destructive">{serverError}</Alert>}
        <div className="space-y-2">
          <Label htmlFor="claim-email">Email</Label>
          <Input id="claim-email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
          {formState.errors.email && <p className="text-xs text-red-600">{formState.errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-password">Password</Label>
          <Input id="claim-password" type="password" autoComplete="new-password" placeholder="8+ characters, letters & numbers" {...register("password")} />
          {formState.errors.password && <p className="text-xs text-red-600">{formState.errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-name">Display name <span className="text-slate-400">(optional — keeps current)</span></Label>
          <Input id="claim-name" autoComplete="name" placeholder={user?.displayName ?? "Ada Lovelace"} {...register("displayName")} />
          {formState.errors.displayName && <p className="text-xs text-red-600">{formState.errors.displayName.message}</p>}
        </div>
        <Button className="w-full" type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />}
          Create account
        </Button>
      </form>
    </Dialog>
  );
}
