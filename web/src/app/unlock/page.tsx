import { Suspense } from "react";
import UnlockForm from "./UnlockForm";

/** The public link asks for the job's passcode once; the phone then stays unlocked for 30 days. */
export default function UnlockPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Enter the passcode</h1>
      <p className="mt-2 text-sm text-muted">This link opens a live WireProof job. Ask the person who sent it for the passcode.</p>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </div>
  );
}
