"use client";

import { useEffect, useRef, useState } from "react";

/** Fades and lifts its children into view the first time they scroll on screen. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={`lp-reveal ${shown ? "lp-in" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Cycles through short words in the hero headline. */
export function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 2600);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <span className="relative inline-grid align-baseline">
      {words.map((w, n) => (
        <span
          key={w}
          aria-hidden={n !== i}
          className={`col-start-1 row-start-1 transition-all duration-700 ease-out ${
            n === i ? "translate-y-0 opacity-100" : n === (i + words.length - 1) % words.length ? "-translate-y-3 opacity-0" : "translate-y-3 opacity-0"
          }`}
        >
          {w}
        </span>
      ))}
    </span>
  );
}

/** The loan lifecycle as a row of steps that light up one after another once on screen. */
export function Pipeline({ steps }: { steps: { label: string; note: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      let n = -1;
      timer = setInterval(() => {
        n += 1;
        setActive(n);
        if (n >= steps.length - 1) {
          clearInterval(timer);
          // Hold the finished pipeline, then replay.
          setTimeout(() => start(), 3500);
        }
      }, 650);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          start();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [steps.length]);

  const pct = active < 0 ? 0 : (active / (steps.length - 1)) * 100;
  return (
    <div ref={ref} className="relative">
      <div className="lp-track" />
      <div className="lp-progress" style={{ ["--p" as never]: pct / 100 }} />
      <ol className="relative grid gap-5 md:grid-cols-10 md:gap-2">
        {steps.map((s, n) => {
          const on = n <= active;
          return (
            <li key={s.label} className="flex items-start gap-4 md:flex-col md:items-center md:gap-3 md:text-center">
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all duration-500 ${
                  on ? "border-[var(--lp-accent)] bg-[var(--lp-accent)] text-white shadow-[0_0_0_6px_rgba(30,64,175,0.10)]" : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {n === steps.length - 1 && on ? "✓" : n + 1}
              </span>
              <span>
                <span className={`block text-sm font-medium transition-colors duration-500 ${on ? "text-slate-900" : "text-slate-400"}`}>{s.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{s.note}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Tabbed product screenshots. */
export function ScreenTabs({ tabs }: { tabs: { key: string; label: string; title: string; src: string }[] }) {
  const [cur, setCur] = useState(0);
  return (
    <div>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:justify-center sm:px-0" role="tablist">
        {tabs.map((t, n) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={n === cur}
            onClick={() => setCur(n)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
              n === cur ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">{tabs[cur].title}</p>
      <BrowserFrame className="mt-6">
        <div className="relative aspect-[1400/875] w-full bg-slate-50">
          {tabs.map((t, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={t.src}
              alt={`LoanOS ${t.label} screen`}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${n === cur ? "opacity-100" : "opacity-0"}`}
            />
          ))}
        </div>
      </BrowserFrame>
    </div>
  );
}

export function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.35)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="ml-3 hidden truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-100 sm:block">
          loanos.fameweb.in/app
        </span>
      </div>
      {children}
    </div>
  );
}
