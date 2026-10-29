"use client";

import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";

export default function UnlockForm() {
  const params = useSearchParams();
  // Shown in place of a locked page, the address bar still holds that page; after a wrong try, it comes back as ?next=.
  const setNext = (e: FormEvent<HTMLFormElement>) => {
    const { pathname, search } = window.location;
    const field = e.currentTarget.elements.namedItem("next") as HTMLInputElement;
    field.value = params.get("next") ?? (pathname !== "/unlock" ? pathname + search : "/jobs/demo/copilot");
  };
  return (
    <form method="post" action="/api/unlock" onSubmit={setNext} className="mt-6 space-y-3">
      <input type="hidden" name="next" defaultValue="/jobs/demo/copilot" />
      <input
        name="passcode"
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoFocus
        required
        placeholder="Passcode"
        className="w-full rounded-lg border border-line bg-card px-4 py-3 text-base"
      />
      {params.get("wrong") && <p className="text-sm text-fail">That passcode didn&apos;t match. Try again.</p>}
      <button type="submit" className="w-full rounded-lg bg-copper px-4 py-3 font-semibold text-white hover:bg-copper/90">Open WireProof</button>
    </form>
  );
}
