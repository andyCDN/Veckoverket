import { describe, expect, it } from "vitest";
import { validateCloudConfig } from "../lib/cloud-config";
const url = "https://example.supabase.co";
const jwt = (role: string) =>
  `header.${btoa(JSON.stringify({ role }))}.signature`;
describe("publik molnkonfiguration", () => {
  it("tillåter lokal drift samt publishable och äldre publika anon-nycklar", () => {
    expect(() => validateCloudConfig(undefined, undefined)).not.toThrow();
    expect(() =>
      validateCloudConfig(url, "sb_publishable_example"),
    ).not.toThrow();
    expect(() => validateCloudConfig(url, jwt("anon"))).not.toThrow();
  });
  it("stoppar ofullständig konfiguration och servernycklar innan klientbygget", () => {
    expect(() => validateCloudConfig(url, undefined)).toThrow();
    expect(() =>
      validateCloudConfig(undefined, "sb_publishable_example"),
    ).toThrow();
    expect(() => validateCloudConfig(url, "sb_secret_example")).toThrow(
      /secret key/,
    );
    expect(() => validateCloudConfig(url, jwt("service_role"))).toThrow(
      /public anon/,
    );
    expect(() => validateCloudConfig(url, "not-a-key")).toThrow();
  });
});
