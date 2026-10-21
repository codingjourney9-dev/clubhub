import Link from "next/link";
import { ArrowLeft, Check, Circle, KeyRound, Lock, Terminal } from "lucide-react";

import { PageHeading } from "@/components/common/page-heading";
import { CancelRequestButton, VerifyCodeForm } from "@/components/features/club-request/pending-club-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/format/date";
import { CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS } from "@/lib/domain/club-verification";
import { revealsCodesOnScreen, type PendingClubView } from "@/lib/services/club-request-service";
import { cn } from "@/lib/utils";

/**
 * The page a PENDING club shows (Phase 12) — only ever to the student who asked
 * for it and to the college's Owners/Admins. Everyone else gets a 404.
 *
 * The student sees where the code went and a box to type it. An admin sees the
 * same facts and can remove the request, but there is deliberately no
 * "approve" button: only the professor's code makes a student club live.
 */
export function PendingClubPanel({
  view,
  demo,
}: {
  view: PendingClubView;
  /** The cookie-free /demo preview: same facts, no buttons, plus the "View as" switcher. */
  demo?: { switcher: React.ReactNode };
}) {
  const now = Date.now();
  const code = view.code;
  const codeState = !code
    ? "none"
    : code.attemptsLeft === 0
      ? "used-up"
      : code.expiresAt.getTime() <= now
        ? "expired"
        : "live";
  const professor = view.facultyName ? `${view.facultyName} (${view.facultyEmail})` : view.facultyEmail;
  const when = (date: Date) => formatDateTimeInZone(date, view.timezone);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href={demo ? "/demo" : "/dashboard"}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}
      >
        <ArrowLeft data-icon="inline-start" />
        {demo ? "Demo dashboard" : "Dashboard"}
      </Link>
      {demo?.switcher}

      <PageHeading
        eyebrow={view.viewer === "requester" ? "Pending · waiting for your professor" : "Pending club request"}
        title={view.name}
        description={[view.collegeName, view.category].filter(Boolean).join(" · ")}
      />

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Progress">
        <Step done label="Club requested" hint={when(view.createdAt)} />
        <Step current label="Professor's code" hint={`Sent to ${view.facultyEmail}`} />
        <Step label="Club goes live" hint="Events, openings and members unlock" />
      </ol>

      {view.viewer === "requester" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              Enter the professor&apos;s code
            </CardTitle>
            <CardDescription>
              A 6-digit code was sent to {professor}. Ask them for it and type it here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <CodeStatus state={codeState} code={code} when={when} />

            {code?.demoCode && codeState === "live" ? (
              <Alert>
                <Terminal />
                <AlertTitle>
                  Demo mode: the code is <span className="font-mono text-base tracking-widest">{code.demoCode}</span>
                </AlertTitle>
                <AlertDescription>
                  No real email is sent in this project. On your computer the code also appears in the black
                  terminal window running the app; on the live site it appears only in the server log.
                </AlertDescription>
              </Alert>
            ) : !revealsCodesOnScreen() ? (
              <p className="text-sm text-muted-foreground">
                No real email is sent yet: on this site the code is written to the server log, which the site
                owner can read (Vercel → Logs).
              </p>
            ) : null}

            {demo ? (
              <DemoNote />
            ) : (
              <>
                <VerifyCodeForm clubId={view.id} clubName={view.name} canVerify={codeState === "live"} />
                <CancelRequestButton clubId={view.id} clubName={view.name} viewer="requester" />
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
            <CardDescription>
              College admins can see and remove club requests, but can&apos;t approve them — a student&apos;s
              club goes live only with the professor&apos;s code.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Asked by</dt>
              <dd>{view.requester ? `${view.requester.name} (${view.requester.email})` : "Unknown"}</dd>
              <dt className="text-muted-foreground">Professor</dt>
              <dd className="break-all">{professor}</dd>
              <dt className="text-muted-foreground">Requested</dt>
              <dd>{when(view.createdAt)}</dd>
              <dt className="text-muted-foreground">Code</dt>
              <dd>
                {codeState === "live" && code
                  ? `Sent ${when(code.lastSentAt)}, works until ${when(code.expiresAt)} · ${code.attemptsLeft} of ${MAX_CODE_ATTEMPTS} tries left`
                  : codeState === "expired"
                    ? "Expired — the student needs a new one"
                    : codeState === "used-up"
                      ? "All tries used — the student needs a new one"
                      : "None waiting"}
              </dd>
              {view.description ? (
                <>
                  <dt className="text-muted-foreground">About</dt>
                  <dd className="whitespace-pre-line">{view.description}</dd>
                </>
              ) : null}
            </dl>
            {demo ? <DemoNote /> : <CancelRequestButton clubId={view.id} clubName={view.name} viewer="admin" />}
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Until the code is entered the club is hidden from everyone else: no public page, events, openings or invite
        links.
      </p>
    </div>
  );
}

function DemoNote() {
  return (
    <p className="rounded-md border border-dashed border-foreground/25 px-4 py-3 text-sm text-muted-foreground">
      Read-only preview. The code box and the Cancel / Remove buttons appear when you sign in on your own
      computer (see docs/START-HERE.md).
    </p>
  );
}

function Step({ label, hint, done = false, current = false }: { label: string; hint: string; done?: boolean; current?: boolean }) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        current ? "border-primary/60 bg-primary/5" : "border-border bg-card",
      )}
      aria-current={current ? "step" : undefined}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          done ? "border-foreground bg-foreground text-background" : current ? "border-primary text-primary" : "text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" /> : <Circle className={cn("size-2.5", current && "fill-current")} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="text-xs break-words text-muted-foreground">{hint}</span>
      </span>
    </li>
  );
}

function CodeStatus({
  state,
  code,
  when,
}: {
  state: "none" | "used-up" | "expired" | "live";
  code: PendingClubView["code"];
  when: (date: Date) => string;
}) {
  if (state === "live" && code) {
    return (
      <p className="text-sm">
        Works until <span className="font-medium">{when(code.expiresAt)}</span> ·{" "}
        <span className="font-medium">
          {code.attemptsLeft} of {MAX_CODE_ATTEMPTS}
        </span>{" "}
        tries left
      </p>
    );
  }
  const message =
    state === "expired"
      ? `The last code has expired (codes work for ${CODE_TTL_MINUTES} minutes).`
      : state === "used-up"
        ? `The last code had ${MAX_CODE_ATTEMPTS} wrong tries and no longer works.`
        : "There is no code waiting.";
  return (
    <Alert variant="destructive">
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription>Press “Send a new code” below — your professor gets a fresh one.</AlertDescription>
    </Alert>
  );
}
