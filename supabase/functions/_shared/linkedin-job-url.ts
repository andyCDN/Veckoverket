export function linkedInJobUrl(raw: string): string | null {
  try {
    const value = raw.trim();
    const u = new URL(
      /^(?:www\.)?linkedin\.com\//i.test(value) ? `https://${value}` : value,
    );
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      !(u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com"))
    )
      return null;
    const path = u.pathname.match(
      /^\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d+)\/?$/i,
    );
    const id =
      path?.[1] ??
      (/^\/jobs(?:\/|$)/i.test(u.pathname)
        ? u.searchParams.get("currentJobId")
        : null);
    if (!id || !/^[1-9]\d{0,23}$/.test(id)) return null;
    return `https://www.linkedin.com/jobs/view/${id}/`;
  } catch {
    return null;
  }
}
