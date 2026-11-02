import { NewJobForm } from "./NewJobForm";

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Start a job</h1>
      <p className="mt-1 text-sm text-muted">
        Two minutes on the phone, before the first conduit goes in. Loads and run lengths start from typical values; tell the
        copilot the real ones on site (&ldquo;the kitchen ring is 42 metres&rdquo;).
      </p>
      <NewJobForm />
    </div>
  );
}
