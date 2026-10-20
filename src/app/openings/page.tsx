import type { Metadata } from "next";

import { PageHeading } from "@/components/common/page-heading";
import { OpeningGrid } from "@/components/features/recruitment/opening-card";
import { listOpenOpenings } from "@/lib/services/recruitment-service";

export const metadata: Metadata = { title: "Club openings" };
export const dynamic = "force-dynamic";

/** The whole recruitment board — public, every college. */
export default async function OpeningsPage() {
  const openings = await listOpenOpenings({ limit: 48 });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <PageHeading
        eyebrow={openings.length ? `${openings.length} open now · every college` : "Every college"}
        title="Club recruitment board"
        description="Clubs looking for new members and Leads. Anyone signed in can apply — even from another college. Open one to see what it involves and the questions the club asks."
      />
      <OpeningGrid openings={openings} />
    </div>
  );
}
