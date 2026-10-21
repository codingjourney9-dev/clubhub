"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClubSchema, type CreateClubInput } from "@/lib/validation/club";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";

/**
 * Creates a club inside a college.
 *
 * `tenantId` is sent because the API needs to know the target college — but the
 * server re-checks that the caller is an Owner/Admin of exactly that college, so
 * a tampered value cannot create a club somewhere you do not belong.
 */
export function CreateClubForm({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubInput>({
    resolver: zodResolver(createClubSchema),
    defaultValues: { tenantId, name: "", description: "", category: "" },
  });

  async function onSubmit(values: CreateClubInput) {
    const result = await callApi<{ club: { name: string } }>("/api/clubs", {
      method: "POST",
      json: { ...values, tenantId },
    });

    if (!result.ok) {
      for (const [field, message] of Object.entries(fieldErrorsOf(result))) {
        if (message && field in values) setError(field as keyof CreateClubInput, { message });
      }
      notifyFailure(result, "Could not create the club");
      return;
    }

    toast.success("Club created", {
      description: `${result.data.club.name} is ready — you are its President.`,
    });
    reset({ tenantId, name: "", description: "", category: "" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Creating a club in <span className="font-medium text-foreground">{tenantName}</span>. You become
        its President so it can start running events.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="club-name">Club name</Label>
          <Input id="club-name" placeholder="Robotics Club" {...register("name")} />
          {errors.name ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="club-category">Category (optional)</Label>
          <Input id="club-category" placeholder="Technology" {...register("category")} />
          {errors.category ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.category.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="club-description">Description (optional)</Label>
        <Textarea
          id="club-description"
          rows={3}
          placeholder="What does this club do?"
          {...register("description")}
        />
        {errors.description ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.description.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create club"}
      </Button>
    </form>
  );
}
