import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { OpeningGrid } from "@/components/features/recruitment/opening-card";
import { buttonVariants } from "@/components/ui/button";
import type { PublicOpening } from "@/lib/services/recruitment-service";
import { cn } from "@/lib/utils";

/** The dashboard's recruitment section — same for guests and members. */
export function RecruitmentBoard({ openings }: { openings: readonly PublicOpening[] }) {
  return (
    <section id="recruitment" aria-labelledby="recruitment-heading" className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">
            {openings.length ? "Clubs looking for people · any college can apply" : "Any college can apply"}
          </span>
          <h2 id="recruitment-heading" className="text-2xl font-bold">
            Club recruitment board
          </h2>
        </div>
        <Link href="/openings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          All openings
          <ArrowUpRight data-icon="inline-end" />
        </Link>
      </div>
      <OpeningGrid openings={openings} />
    </section>
  );
}
