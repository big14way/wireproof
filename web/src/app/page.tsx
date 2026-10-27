import { ButtonLink, Stat } from "@/components/ui";

const users = [
  {
    who: "The electrician",
    what: "Works hands-free. Asks out loud, gets the cable and breaker answer on screen, and ends the day with a professional job report.",
    href: "/jobs/demo/copilot",
    cta: "Open the copilot",
  },
  {
    who: "The homeowner",
    what: "Sees proof, circuit by circuit, before the walls are plastered — and keeps a map of every cable inside them.",
    href: "/jobs/demo/report",
    cta: "See an owner report",
  },
  {
    who: "The inspector",
    what: "Gets a pre-inspection pack where every flag cites the frame it came from and the regulation it breaks.",
    href: "/jobs/demo",
    cta: "Open the demo job",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-copper">Before the plaster goes on</p>
      <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Proof your wiring is safe — while you can still see it.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">
        WireProof is a hands-free copilot for the electrician wiring a house. It reads every cable print and breaker,
        catches fake copper with a magnet test, and gives the owner per-circuit proof before the walls are closed.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/jobs/demo">Open the demo job</ButtonLink>
        <ButtonLink href="/panel" variant="ghost">Read a breaker panel</ButtonLink>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value="1,685" label="Fires in Lagos in 2025 (Lagos Fire Service)" />
        <Stat value="133" label="Deaths from those fires" tone="fail" />
        <Stat value="#1" label="Electrical faults: the leading cause in Lagos studies" tone="warn" />
        <Stat value="Fe" label="“Copper” cable seized by SON that is really coated iron" />
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {users.map((u) => (
          <div key={u.who} className="flex flex-col rounded-xl border border-line bg-card p-5">
            <h3 className="font-semibold">{u.who}</h3>
            <p className="mt-2 flex-1 text-sm text-ink-2">{u.what}</p>
            <div className="mt-4">
              <ButtonLink href={u.href} variant="ghost">{u.cta} →</ButtonLink>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl bg-ink p-6 text-white">
        <h2 className="text-lg font-semibold">How it decides</h2>
        <ol className="mt-3 grid gap-3 text-sm text-white/85 sm:grid-cols-4">
          <li><span className="font-mono text-copper">01</span> Muse Voice Transcribe hears the electrician, hands-free.</li>
          <li><span className="font-mono text-copper">02</span> Muse Spark reads cable prints, breakers and the magnet test.</li>
          <li><span className="font-mono text-copper">03</span> SAM 3.1 traces every conduit run in the wall.</li>
          <li><span className="font-mono text-copper">04</span> Plain code applies the wiring regulations. The model never decides.</li>
        </ol>
      </div>
    </div>
  );
}
