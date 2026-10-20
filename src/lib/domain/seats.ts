/** "12 seats left", "Full — waitlist open", "Open entry": what a student actually asks. */
export function seatsLabel(capacity: number | null, registered: number, waitlistEnabled: boolean): {
  text: string;
  tone: "open" | "low" | "full";
} {
  if (capacity === null) return { text: "Open entry", tone: "open" };
  const left = Math.max(capacity - registered, 0);
  if (left === 0) return { text: waitlistEnabled ? "Full · waitlist open" : "Full", tone: "full" };
  if (left <= Math.max(5, Math.ceil(capacity * 0.1))) return { text: `Only ${left} left`, tone: "low" };
  return { text: `${left} seats left`, tone: "open" };
}
