"use client";
import { AppRecovery } from "@/components/app-recovery";
export default function GlobalError({
  error,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="sv">
      <body>
        <AppRecovery error={error} />
      </body>
    </html>
  );
}
