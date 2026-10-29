"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Download, Share, Check } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { Modal } from "./modal";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = {
  installed: boolean;
  busy: boolean;
  install: () => void;
};
const InstallContext = createContext<InstallState>({
  installed: false,
  busy: false,
  install: () => {},
});

export function AppInstallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prompt = useRef<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">(
    "desktop",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setInstalled(
        mode.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const capture = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPromptEvent;
    };
    const complete = () => {
      prompt.current = null;
      setInstalled(true);
      setHelp(false);
    };
    sync();
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(
      ios ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop",
    );
    mode.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    if (
      process.env.NEXT_PUBLIC_PWA_ENABLED === "true" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      void navigator.serviceWorker
        .register(appPath("/sw.js"), {
          scope: appPath(),
          updateViaCache: "none",
        })
        .catch(() => {
          // Installation through the browser remains available. Registration is
          // retried when the page opens again; workspace storage stays independent.
        });
    }
    return () => {
      mode.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  async function requestInstall() {
    if (busy || installed) return;
    const event = prompt.current;
    setMessage("");
    if (!event) {
      setHelp(true);
      return;
    }
    prompt.current = null;
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted")
        setMessage("Installationen har startats.");
    } catch {
      setHelp(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <InstallContext.Provider
      value={{
        installed,
        busy,
        install: () => {
          void requestInstall();
        },
      }}
    >
      {children}
      {message && (
        <div className="install-message" role="status">
          {message}
          <button
            aria-label="Stäng installationsmeddelande"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
      {help && (
        <Modal
          title="Installera Veckoverket"
          description="Öppna planen från hemskärmen i ett eget appfönster."
          onClose={() => setHelp(false)}
        >
          <div className="stack install-help">
            <img
              className="install-icon"
              src={appPath("/icons/veckoverket-192.png")}
              alt="Veckoverkets appikon: V med gul bock"
              width={80}
              height={80}
            />
            {platform === "ios" ? (
              <ol>
                <li>Öppna Veckoverket i Safari.</li>
                <li>
                  Tryck på <strong>Dela (Share)</strong>{" "}
                  <Share size={15} aria-hidden="true" />.
                </li>
                <li>
                  Välj{" "}
                  <strong>Lägg till på hemskärmen (Add to Home Screen)</strong>{" "}
                  och sedan <strong>Lägg till (Add)</strong>.
                </li>
              </ol>
            ) : platform === "android" ? (
              <ol>
                <li>Öppna Veckoverket i Chrome.</li>
                <li>
                  Öppna webbläsarens meny <strong>⋮</strong>.
                </li>
                <li>
                  Välj <strong>Installera appen (Install app)</strong> eller{" "}
                  <strong>
                    Lägg till på startskärmen (Add to Home screen)
                  </strong>
                  .
                </li>
              </ol>
            ) : (
              <div className="stack">
                <p>
                  <strong>Chrome eller Edge:</strong> använd installationsikonen
                  i adressfältet eller välj <strong>Install Veckoverket</strong>{" "}
                  i webbläsarens meny.
                </p>
                <p>
                  <strong>Safari på Mac:</strong> välj{" "}
                  <strong>File → Add to Dock</strong>.
                </p>
              </div>
            )}
            <p className="help">
              Öppna appen med internet första gången. Appens sparade vy kan
              sedan öppnas utan nät. Inloggning, Google-import och molnsynk
              kräver anslutning.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Stäng
            </button>
          </div>
        </Modal>
      )}
    </InstallContext.Provider>
  );
}
export function AppInstallButton({
  className = "button secondary",
}: {
  className?: string;
}) {
  const { installed, busy, install } = useContext(InstallContext);
  if (installed) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={install}
      disabled={busy}
    >
      <Download size={16} />{" "}
      {busy ? "Öppnar installation…" : "Installera appen"}
    </button>
  );
}
export function AppInstallCard() {
  const { installed } = useContext(InstallContext);
  return (
    <section className="data-section app-install-section">
      <img
        className="install-icon"
        src={appPath("/icons/veckoverket-192.png")}
        alt="Veckoverkets appikon"
        width={64}
        height={64}
      />
      <div>
        <h3>
          {installed
            ? "Veckoverket är installerad"
            : "Veckoverket på hemskärmen"}
        </h3>
        <p>Öppna dagens aktiviteter som en app med egen ikon.</p>
      </div>
      {installed ? (
        <span className="install-complete">
          <Check size={17} /> Appvy
        </span>
      ) : (
        <AppInstallButton />
      )}
    </section>
  );
}
