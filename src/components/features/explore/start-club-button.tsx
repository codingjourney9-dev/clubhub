"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { authHref } from "@/lib/auth/callback-url";
import { START_CLUB_PATH } from "@/lib/domain/club-paths";
import { cn } from "@/lib/utils";


const FAB_CLASSES =
  "fixed right-4 bottom-4 z-40 h-12 rounded-full px-5 shadow-print sm:right-6 sm:bottom-6";

/**
 * "Start a new club" — the one call to action every dashboard visitor sees.
 *
 * Signed in: a plain link. Guest: the same button opens a small dialog that
 * explains why an account is needed and offers both doors (sign in / create
 * account), each of which brings them back to club creation afterwards. This is
 * the "auth interceptor": the guest is never dumped on a bare sign-in form.
 *
 * Note the dialog is convenience, not security — `/clubs/new` sends signed-out
 * visitors to sign in by itself, and every club API checks the session on the server.
 */
export function StartClubButton({
  signedIn,
  placement = "inline",
  className,
}: {
  signedIn: boolean;
  placement?: "inline" | "floating";
  className?: string;
}) {
  const classes = cn(
    buttonVariants({ size: placement === "floating" ? "lg" : "default" }),
    placement === "floating" && FAB_CLASSES,
    className,
  );

  const label = (
    <>
      <Plus data-icon="inline-start" />
      Start a new club
    </>
  );

  if (signedIn) {
    return (
      <Link href={START_CLUB_PATH} className={classes}>
        {label}
      </Link>
    );
  }

  return (
    <Dialog>
      <DialogTrigger className={classes}>{label}</DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="gap-2">
          <span className="eyebrow text-primary">One quick step</span>
          <DialogTitle className="font-heading text-2xl font-bold">Sign in to start a club</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Every club needs a President, and that&apos;s you — so we need to know who you are. Browsing
            events stays free and open; this only takes a minute.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Link href={authHref("/sign-up", START_CLUB_PATH)} className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
            Create an account
          </Link>
          <Link
            href={authHref("/sign-in", START_CLUB_PATH)}
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "sm:flex-1")}
          >
            I have an account
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
