"use client";
import { AppRecovery } from "@/components/app-recovery";
export default function ErrorPage({
  error,
}: {
  error: unknown;
  retry: () => void;
}) {
  return <AppRecovery error={error} />;
}
