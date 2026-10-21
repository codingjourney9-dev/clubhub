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
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";

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
    const result = await callApi<{ tenant: { name: string } }>("/api/tenants", {
      method: "POST",
      json: values,
    });

    if (!result.ok) {
      for (const [field, message] of Object.entries(fieldErrorsOf(result))) {
        if (message && field in values) setError(field as keyof CreateTenantInput, { message });
      }
      notifyFailure(result, "Could not create the college");
      return;
    }

    toast.success("College created", {
      description: `You are now the Owner of ${result.data.tenant.name}.`,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        Event times are typed and shown in this timezone, so everyone sees the college&apos;s local time.
      </p>

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create college"}
      </Button>
    </form>
  );
}
