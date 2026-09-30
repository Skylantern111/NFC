import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { cardPosition, scrollTargetTop, spotlightRect } from './tutorialLayout';

// How long to wait for a step's first-choice element (its page may still be
// loading code or data) before settling for a fallback, and when to stop
// looking and just show the card in the middle.
const PREFERRED_WAIT_MS = 1200;
const GIVE_UP_MS = 4000;
// Phone top bar height: scrolled-to elements land below it.
const TOP_CLEARANCE = 72;

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// First visible element for the step's targets. The same data-tour name can
// be on two elements (desktop sidebar and phone top bar); the visible one
// wins. `preferredOnly` checks just the first target.
function findTarget(step, preferredOnly) {
  if (window.location.pathname !== step.route) return null;
  const names = preferredOnly ? step.targets.slice(0, 1) : step.targets;
  for (const name of names) {
    const match = [...document.querySelectorAll(`[data-tour="${name}"]`)].find(isVisible);
    if (match) return match;
  }
  return null;
}

// Fixed chrome at the bottom of the screen (the owner's phone tab bar).
function bottomInset() {
  const bar = document.querySelector('[data-tour-bottom-bar]');
  return isVisible(bar) ? bar.getBoundingClientRect().height : 0;
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Bring the element (and room for the card) on screen.
function scrollToTarget(el, cardHeight) {
  // A fixed element (the desktop sidebar) doesn't move when scrolled.
  if (getComputedStyle(el).position === 'fixed') return;
  const r = el.getBoundingClientRect();
  const top = scrollTargetTop({
    rect: { top: r.top, height: r.height },
    cardHeight,
    viewportHeight: window.innerHeight,
    insetBottom: bottomInset(),
    topClearance: TOP_CLEARANCE,
  });
  if (top === null) return;
  window.scrollTo({ top: window.scrollY + r.top - top, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// Pointer placement per card side: it sits on the edge facing the element.
const ARROW = {
  bottom: '-top-1.5 -translate-x-1/2 border-l border-t',
  top: '-bottom-1.5 -translate-x-1/2 border-b border-r',
  right: '-left-1.5 -translate-y-1/2 border-b border-l',
  left: '-right-1.5 -translate-y-1/2 border-r border-t',
};

function sameBox(a, b) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function readViewport() {
  return { width: document.documentElement.clientWidth, height: window.innerHeight };
}

export default function TutorialOverlay({ step, index, total, onNext, onPrev, onSkip }) {
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef(null);
  const primaryRef = useRef(null);
  const targetRef = useRef(null);
  const [box, setBox] = useState(null);
  const [layout, setLayout] = useState({ viewport: readViewport(), card: { width: 320, height: 200 }, inset: 0 });
  const last = index === total - 1;

  // Find this step's element, waiting for its page to render.
  useEffect(() => {
    targetRef.current = null;
    setBox(null);
    const started = performance.now();
    let timer;
    const tick = () => {
      const elapsed = performance.now() - started;
      const found = findTarget(step, elapsed < PREFERRED_WAIT_MS);
      if (found) {
        targetRef.current = found;
        scrollToTarget(found, cardRef.current?.offsetHeight || 220);
        return;
      }
      if (elapsed < GIVE_UP_MS) timer = setTimeout(tick, 100);
    };
    tick();
    return () => clearTimeout(timer);
  }, [step]);

  // Follow the element as the page scrolls, resizes or re-renders.
  useEffect(() => {
    let frame;
    const loop = () => {
      let el = targetRef.current;
      if (el && !isVisible(el)) {
        el = findTarget(step, false);
        targetRef.current = el;
      }
      const r = el ? el.getBoundingClientRect() : null;
      const next = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      setBox((prev) => (sameBox(prev, next) ? prev : next));
      const card = cardRef.current;
      const size = card ? { width: card.offsetWidth, height: card.offsetHeight } : null;
      const viewport = readViewport();
      const inset = bottomInset();
      setLayout((prev) =>
        (size && (size.width !== prev.card.width || size.height !== prev.card.height)) ||
        viewport.width !== prev.viewport.width ||
        viewport.height !== prev.viewport.height ||
        inset !== prev.inset
          ? { viewport, card: size || prev.card, inset }
          : prev
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Keyboard: Esc skips, arrows move, Tab stays inside the card.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'Tab' && cardRef.current) {
        const focusable = [...cardRef.current.querySelectorAll('button:not([disabled])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        const inside = cardRef.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, onNext, onPrev, onSkip]);

  // Focus the main button on each step; give focus back when the tour ends.
  useLayoutEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [index]);
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const spot = spotlightRect(box, layout.viewport);
  const pos = cardPosition({ spot, card: layout.card, viewport: layout.viewport, insetBottom: layout.inset });
  // Little pointer from the card to the element, kept off the rounded corners.
  const vertical = pos.side === 'left' || pos.side === 'right';
  const arrowAt = spot
    ? vertical
      ? Math.min(Math.max(spot.top + spot.height / 2 - pos.top, 24), layout.card.height - 24)
      : Math.min(Math.max(spot.left + spot.width / 2 - pos.left, 24), layout.card.width - 24)
    : null;
  const motion = 'transition-all duration-300 ease-out motion-reduce:transition-none';

  return createPortal(
    <div data-tour-overlay="">
      {/* Blocks clicks on the page behind; dims it when nothing is highlighted. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[70] ${spot ? '' : 'bg-slate-950/55'}`}
      />
      {spot && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-[70] rounded-2xl ring-2 ring-purple-400 dark:ring-purple-300 ${motion}`}
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`fixed z-[71] w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-white/60 bg-base p-5 shadow-card dark:border-white/10 ${motion}`}
        style={{ left: pos.left, top: pos.top }}
      >
        {spot && pos.side !== 'center' && (
          <span
            aria-hidden="true"
            className={`absolute h-3 w-3 rotate-45 border-white/60 bg-base dark:border-white/10 ${ARROW[pos.side]}`}
            style={vertical ? { top: arrowAt } : { left: arrowAt }}
          />
        )}
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
          Step {index + 1} of {total}
        </p>
        <h2 id={titleId} className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
          {step.body}
        </p>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={onPrev} aria-label="Previous step">
                <ArrowLeft aria-hidden="true" />
                <span className="max-[359px]:hidden">Previous</span>
              </Button>
            )}
            <Button ref={primaryRef} type="button" variant="primary" size="sm" onClick={onNext}>
              {last ? (
                <>
                  <Check aria-hidden="true" /> Finish
                </>
              ) : (
                <>
                  Next <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
