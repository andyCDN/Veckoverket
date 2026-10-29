"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGoogleWeek,
  GOOGLE_SCOPES,
  GoogleAuthorizationError,
  listGoogleCalendars,
  type GoogleCalendar,
} from "./google-calendar";
export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};
type TokenClient = {
  requestAccessToken: (options: { prompt: string }) => void;
};
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            include_granted_scopes: boolean;
            callback: (response: TokenResponse) => void;
            error_callback: () => void;
          }) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}
export function useGoogleCalendar(owner: string) {
  const [state, setState] = useState({
    ready: false,
    connecting: false,
    connected: false,
    calendars: [] as GoogleCalendar[],
    error: "",
    connection: 0,
  });
  const session = useRef({
    epoch: 0,
    owner,
    token: "",
    expiresAt: 0,
    abort: new AbortController(),
  });
  useEffect(() => {
    session.current.abort.abort();
    session.current = {
      epoch: session.current.epoch + 1,
      owner,
      token: "",
      expiresAt: 0,
      abort: new AbortController(),
    };
    setState((s) => ({
      ...s,
      connecting: false,
      connected: false,
      calendars: [],
      error: "",
      connection: s.connection + 1,
    }));
    return () => {
      session.current.abort.abort();
      session.current.token = "";
      session.current.epoch++;
    };
  }, [owner]);
  const markReady = useCallback(
    () =>
      setState((s) => ({
        ...s,
        ready: Boolean(window.google?.accounts.oauth2),
        error: window.google?.accounts.oauth2
          ? ""
          : "Googles inloggning kunde inte laddas. Ladda om sidan och försök igen.",
      })),
    [],
  );
  const scriptError = useCallback(
    () =>
      setState((s) => ({
        ...s,
        ready: false,
        error:
          "Googles inloggning kunde inte laddas. Kontrollera anslutningen och ladda om sidan.",
      })),
    [],
  );
  const connect = useCallback(() => {
    const oauth = window.google?.accounts.oauth2;
    if (!googleClientId || !oauth) return;
    const current = session.current,
      epoch = ++current.epoch;
    current.abort.abort();
    current.abort = new AbortController();
    current.token = "";
    current.expiresAt = 0;
    setState((s) => ({
      ...s,
      connecting: true,
      connected: false,
      calendars: [],
      error: "",
      connection: s.connection + 1,
    }));
    try {
      const client = oauth.initTokenClient({
        client_id: googleClientId,
        scope: GOOGLE_SCOPES.join(" "),
        include_granted_scopes: false,
        error_callback: () => {
          if (session.current.epoch === epoch)
            setState((s) => ({
              ...s,
              connecting: false,
              error:
                "Google-inloggningen stängdes eller kunde inte öppnas. Försök igen.",
            }));
        },
        callback: (response) => {
          if (
            session.current.epoch !== epoch ||
            session.current.owner !== owner
          )
            return;
          const scopes = new Set(response.scope?.split(" "));
          if (
            response.error ||
            !response.access_token ||
            !Number.isFinite(Number(response.expires_in)) ||
            Number(response.expires_in) <= 0 ||
            !GOOGLE_SCOPES.every((scope) => scopes.has(scope))
          ) {
            setState((s) => ({
              ...s,
              connecting: false,
              error:
                "Google gav inte läsbehörighet till kalendern. Anslut igen och godkänn kalenderbehörigheterna.",
            }));
            return;
          }
          current.token = response.access_token;
          current.expiresAt =
            Date.now() + Math.max(0, Number(response.expires_in) || 0) * 1000;
          void listGoogleCalendars(
            current.token,
            AbortSignal.any([current.abort.signal, AbortSignal.timeout(20000)]),
          )
            .then((calendars) => {
              if (session.current.epoch === epoch)
                setState((s) => ({
                  ...s,
                  connecting: false,
                  connected: true,
                  calendars,
                  error: "",
                  connection: s.connection + 1,
                }));
            })
            .catch((error) => {
              if (session.current.epoch === epoch)
                setState((s) => ({
                  ...s,
                  connecting: false,
                  connected: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Kalendrarna kunde inte hämtas.",
                }));
            });
        },
      });
      // Called synchronously from the user's click after the SDK has loaded.
      client.requestAccessToken({ prompt: "select_account" });
    } catch {
      setState((s) => ({
        ...s,
        connecting: false,
        error:
          "Google-inloggningen kunde inte öppnas. Kontrollera att popupfönster tillåts och försök igen.",
      }));
    }
  }, [owner]);
  const readWeek = useCallback(
    async (calendars: GoogleCalendar[], week: string) => {
      const current = session.current,
        epoch = current.epoch;
      if (!current.token || current.expiresAt <= Date.now() + 10000) {
        current.token = "";
        setState((s) => ({
          ...s,
          connected: false,
          error:
            "Google-anslutningen har gått ut. Anslut igen för att hämta kalendern.",
        }));
        throw new GoogleAuthorizationError();
      }
      try {
        const snapshot = await fetchGoogleWeek(
          current.token,
          calendars,
          week,
          AbortSignal.any([current.abort.signal, AbortSignal.timeout(30000)]),
        );
        if (session.current.epoch !== epoch)
          throw new DOMException("Connection changed", "AbortError");
        return snapshot;
      } catch (error) {
        if (
          error instanceof GoogleAuthorizationError &&
          session.current.epoch === epoch
        ) {
          current.token = "";
          setState((s) => ({ ...s, connected: false, error: error.message }));
        }
        throw error;
      }
    },
    [],
  );
  const disconnect = useCallback(() => {
    const current = session.current,
      token = current.token;
    current.epoch++;
    current.abort.abort();
    current.token = "";
    current.expiresAt = 0;
    setState((s) => ({
      ...s,
      connecting: false,
      connected: false,
      calendars: [],
      error: "",
      connection: s.connection + 1,
    }));
    if (token)
      try {
        window.google?.accounts.oauth2.revoke(token, () => {});
      } catch {
        /* The local session is already cleared. */
      }
  }, []);
  return {
    ...state,
    configured: Boolean(googleClientId),
    markReady,
    scriptError,
    connect,
    readWeek,
    disconnect,
  };
}
export type GoogleConnection = ReturnType<typeof useGoogleCalendar>;
