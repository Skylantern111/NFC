import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import TutorialOverlay from './TutorialOverlay';

// In-app guided tour. Each console mounts
// its own provider with its own tour: DashboardLayout the owner tour,
// AdminLayout (inside AdminGate) the admin tour — so an owner can never be
// shown admin steps, and route guards stay the only access control.
//
// Progress is per browser and per account in localStorage: finishing or
// skipping sets `<storageKey>:<uid>`, and the tour then only starts again
// from Settings › Help. No Firestore writes.
const TutorialContext = createContext(null);

// Used when localStorage is blocked, so the tour still only shows once per
// page load.
const doneThisSession = new Set();

function progressKey(tour, uid) {
  return `${tour.storageKey}:${uid || 'guest'}`;
}

function isDone(key) {
  if (doneThisSession.has(key)) return true;
  try {
    return !!window.localStorage.getItem(key);
  } catch {
    return false;
  }
}

function markDone(key, outcome) {
  doneThisSession.add(key);
  try {
    window.localStorage.setItem(key, JSON.stringify({ outcome, at: Date.now() }));
  } catch {
    // Storage blocked: doneThisSession covers this page load.
  }
}

export function useTutorial() {
  return useContext(TutorialContext);
}

export default function TutorialProvider({ tour, children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(-1);
  const key = progressKey(tour, user?.uid);
  const active = index >= 0;
  const step = active ? tour.steps[index] : null;

  const start = useCallback(() => setIndex(0), []);
  const end = useCallback(
    (outcome) => {
      markDone(key, outcome);
      setIndex(-1);
    },
    [key]
  );
  const next = useCallback(() => {
    if (index >= tour.steps.length - 1) end('completed');
    else setIndex(index + 1);
  }, [index, tour.steps.length, end]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const skip = useCallback(() => end('skipped'), [end]);

  // First visit to the console's home page: start once the page has had a
  // moment to render.
  useEffect(() => {
    if (active || pathname !== tour.autoStartPath || isDone(key)) return undefined;
    const id = setTimeout(() => setIndex(0), 800);
    return () => clearTimeout(id);
  }, [active, pathname, tour.autoStartPath, key]);

  // Open the step's page. Only when the step changes, so the browser's
  // Back button isn't fought with.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const route = step?.route;
  useEffect(() => {
    if (route && pathRef.current !== route) navigate(route);
  }, [index, route, navigate]);

  const value = useMemo(() => ({ start, active, tourId: tour.id }), [start, active, tour.id]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {step && (
        <TutorialOverlay
          step={step}
          index={index}
          total={tour.steps.length}
          onNext={next}
          onPrev={prev}
          onSkip={skip}
        />
      )}
    </TutorialContext.Provider>
  );
}
