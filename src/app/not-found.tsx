import Link from "next/link";
import { Compass } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The 404 page.
 *
 * This app answers "not found" for two very different reasons: the address is
 * wrong, or the thing exists but is not yours to see (a draft, another college's
 * event, a members-only club). Both get the same page on purpose — a 404 that says
 * "you are not allowed" would confirm the resource exists, which is exactly what
 * the guards avoid.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="size-4 text-muted-foreground" />
            There is nothing at this address
          </CardTitle>
          <CardDescription>
            It may never have existed, it may have been deleted, or it may belong to another
            college. For private things, ClubHub deliberately does not say which.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/dashboard" className={cn(buttonVariants())}>
            Back to the dashboard
          </Link>
          <Link href="/events" className={cn(buttonVariants({ variant: "outline" }))}>
            Browse events
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
