"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Opens WhatsApp with the report's summary and its link, ready to send. The link is built from the address the
 * app was opened on, so it is the public one when the electrician is using the phone through the public URL.
 */
export function WhatsAppShare({ text, path, phone, label }: { text: string; path: string; phone?: string; label: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const local = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin);
  const link = origin ? new URL(path, origin).href : "";
  const href = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(`${text}\n\n${link}`)}`;
  return (
    <div className="flex flex-col items-end gap-1">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!origin}
        className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink hover:bg-[#1fb857]"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
        </svg>
        {label}
      </a>
      {local && <span className="text-xs text-warn">This link only opens on this computer. Use the app&apos;s public address to send it.</span>}
    </div>
  );
}
