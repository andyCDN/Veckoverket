import { documentUrl } from "./application-materials";
import { linkedInJobUrl } from "../../supabase/functions/_shared/linkedin-job-url";

export function platsbankenJobUrl(raw: string): string | undefined {
  try {
    const value = raw.trim();
    const url = new URL(
      /^(?:www\.)?arbetsformedlingen\.se\//i.test(value)
        ? `https://${value}`
        : value,
    );
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !["arbetsformedlingen.se", "www.arbetsformedlingen.se"].includes(
        url.hostname,
      )
    )
      return;
    const id = url.pathname.match(
      /^\/platsbanken\/annonser\/([1-9]\d{0,23})\/?$/,
    )?.[1];
    if (id) return `https://arbetsformedlingen.se/platsbanken/annonser/${id}`;
  } catch {
    /* Other links can still be saved with manually completed details. */
  }
}

export function jobAdvertisementUrl(raw: string): string | undefined {
  return platsbankenJobUrl(raw) ?? linkedInJobUrl(raw) ?? documentUrl(raw);
}

export function jobUrlKey(raw: string): string | undefined {
  return jobAdvertisementUrl(raw)?.replace(/#.*$/, "").replace(/\/$/, "");
}
