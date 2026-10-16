"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenantSchema,
  type CreateTenantFormValues,
  type CreateTenantInput,
} from "@/lib/validation/tenant";
import type { ApiFailure, ApiSuccess, FieldErrors } from "@/types/api";

/**
 * Self-serve college creation. The creator becomes the college Owner — the only
 * route in the system that mints an Owner, and it happens inside a transaction
 * on the server.
 */
export function CreateTenantForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateTenantFormValues, unknown, CreateTenantInput>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: { name: "", domain: undefined, timezone: "Asia/Kolkata" },
  });

  async function onSubmit(values: CreateTenantInput) {
    const response = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const payload = (await response.json()) as ApiSuccess<{ tenant: { name: string } }> | ApiFailure;

    if (!payload.ok) {
      const details = payload.error.details as FieldErrors | undefined;
      if (details) {
        for (const [field, messages] of Object.entries(details)) {
          const message = messages[0];
          if (message && field in values) setError(field as keyof CreateTenantInput, { message });
        }
      }
      toast.error("Could not create the college", { description: payload.error.message });
      return;
    }

    toast.success("College created", {
      description: `You are now the Owner of ${payload.data.tenant.name}.`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">College name</Label>
        <Input id="name" placeholder="Vadodara Institute of Technology" {...register("name")} />
        {errors.name ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">Email domain (optional)</Label>
          <Input id="domain" placeholder="vit.ac.in" {...register("domain")} />
          {errors.domain ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.domain.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            {...register("timezone")}
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="Asia/Dubai">Asia/Dubai</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
            <option value="UTC">UTC</option>
          </select>
          {errors.timezone ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.timezone.message}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Events are always stored in UTC; this timezone decides how scheduling times are read and shown.
      </p>

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create college"}
      </Button>
    </form>
  );
}
