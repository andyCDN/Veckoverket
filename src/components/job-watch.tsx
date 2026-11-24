"use client";
import { useEffect, useState } from "react";
import { today, uid } from "@/lib/date";
import type { JobApplication } from "@/lib/types";
import { appPath } from "@/lib/app-path";

type Job = { role: string; organization: string; url: string; location: string; deadline: string; summary: string };
type Feed = { updatedAt: string | null; jobs: Job[] };
function validJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const j = value as Job;
  return [j.role,j.organization,j.url,j.location,j.deadline,j.summary].every(v => typeof v === "string") &&
    !!j.role.trim() && !!j.organization.trim() && /^https:\/\//i.test(j.url) &&
    (!j.deadline || /^\d{4}-\d{2}-\d{2}$/.test(j.deadline));
}
const key = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");
export function JobWatch({ applications, onSave }: { applications: JobApplication[]; onSave: (job: JobApplication) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem("veckoverket-job-watch-hidden") || "[]"); if (Array.isArray(saved)) setHidden(saved.filter((v): v is string => typeof v === "string")); } catch {}
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("https://raw.githubusercontent.com/andyCDN/Veckoverket/main/public/jobbspaning.json?t=" + Date.now(), { cache: "no-store", signal: controller.signal })
      .catch(() => fetch(appPath("/jobbspaning.json"), { cache: "no-store", signal: controller.signal }))
      .then(async response => {
        if (!response.ok) throw new Error("Jobbspaningen kunde inte hämtas.");
        const value = await response.json() as Feed;
        if (!Array.isArray(value.jobs)) throw new Error("Ogiltig jobbspaning.");
        if (!controller.signal.aborted) { setFeed({updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null, jobs: value.jobs.filter(validJob)}); setError(""); }
      }).catch(() => { if (!controller.signal.aborted) setError("Jobbspaningen kunde inte hämtas. Försök igen."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const seen = new Set(applications.map(a => key(a.advertisement?.url || "")));
  const visible = (feed?.jobs ?? []).filter(j => (!j.deadline || j.deadline >= today()) && !seen.has(key(j.url)) && !hidden.includes(key(j.url)));
  return <section className="job-workspace stack" aria-label="Jobbspaning">
    <div className="job-toolbar"><div><h2>Jobbspaning</h2><p>{feed?.updatedAt ? "Senast uppdaterad: " + new Date(feed.updatedAt).toLocaleString("sv-SE", {timeZone:"Europe/Stockholm"}) : "Ingen rapport publicerad ännu."}</p></div>
    <button className="button secondary" disabled={loading} onClick={() => { setLoading(true); setReload(v => v+1); }}>Uppdatera</button></div>
    {loading && <p role="status">Hämtar jobb…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && feed?.updatedAt && !visible.length && <p>Inga nya öppna jobb att visa.</p>}
    {visible.map(j => <article key={j.url} className="career-card stack"><h3>{j.role}</h3><p>{j.organization} · {j.location}</p><p>{j.deadline ? "Sök senast " + j.deadline : "Sista ansökningsdag saknas"}</p><p>{j.summary}</p><div className="career-actions">
      <a className="button secondary" href={j.url} target="_blank" rel="noopener noreferrer">Öppna annons</a>
      <button className="button primary" onClick={() => onSave({id:uid(),role:j.role,organization:j.organization,status:"draft",deadline:j.deadline,nextAction:"Förbered ansökan",nextActionKind:"task",nextActionOwner:"Jag",followUpDate:"",notes:j.summary,advertisement:{url:j.url,text:""}})}>Spara jobb</button>
      <button className="text-button" onClick={() => { const next = [...hidden,key(j.url)]; setHidden(next); try { localStorage.setItem("veckoverket-job-watch-hidden",JSON.stringify(next)); } catch {} }}>Dölj</button>
    </div></article>)}
    {!!hidden.length && <button className="text-button" onClick={() => {setHidden([]); try {localStorage.removeItem("veckoverket-job-watch-hidden");} catch {}}}>Visa dolda jobb igen</button>}
  </section>;
}
