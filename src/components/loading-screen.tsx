import type { ReactNode } from "react";
import styles from "./loading-screen.module.css";

export function LoadingScreen({
  message = "Laddar veckoplanen…",
  failed = false,
  children,
}: {
  message?: string;
  failed?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className={styles.screen} aria-labelledby="loading-title">
      <section className={styles.sheet}>
        <div className={styles.registration} aria-hidden="true">
          <span>＋</span>
          <i />
          <i />
          <i />
          <i />
          <span>＋</span>
        </div>
        <div className={styles.art} aria-hidden="true">
          <div className={styles.redInk} />
          <div className={styles.yellowInk} />
          <div className={styles.halftone} />
          <span className={styles.monogram}>V</span>
          <svg className={styles.check} viewBox="0 0 160 130" fill="none">
            <path
              d="M18 62 65 105 143 20"
              stroke="var(--ink)"
              strokeWidth="31"
            />
            <path
              d="M18 62 65 105 143 20"
              stroke="var(--yellow)"
              strokeWidth="21"
            />
          </svg>
          <span className={styles.corner}>＋</span>
        </div>
        <div className={styles.caption}>
          <h1 id="loading-title" className={styles.title}>
            Vecko<span>verket</span>
          </h1>
          <div className={styles.statusLine}>
            <span className={styles.statusMark} aria-hidden="true">
              {failed ? "×" : "＋"}
            </span>
            <p role="status">{message}</p>
          </div>
          {!failed && (
            <div className={styles.indicator} aria-hidden="true">
              <span />
            </div>
          )}
          {children && <div className={styles.recovery}>{children}</div>}
        </div>
      </section>
    </main>
  );
}
