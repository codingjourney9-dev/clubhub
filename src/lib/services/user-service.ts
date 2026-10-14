import "server-only";

import bcrypt from "bcryptjs";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import type { RegisterInput } from "@/lib/validation/auth";

/** Why this module exists: password hashing and uniqueness live in ONE place, shared by the API route and any future server action or CLI. */

/** Never select `passwordHash` into a response. */
export const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  timezone: true,
  createdAt: true,
} as const;

const BCRYPT_ROUNDS = 12;

export async function registerUser(input: RegisterInput) {
  const existing = await db.user.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError("CONFLICT", "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    return await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      select: publicUserSelect,
    });
  } catch (error) {
    // Lost a race against a concurrent signup for the same email: the unique
    // index is the source of truth, not the pre-check above.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError("CONFLICT", "An account with this email already exists.");
    }
    throw error;
  }
}
