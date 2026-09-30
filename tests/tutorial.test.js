// Guided tour (src/components/tutorial): step card placement and the owner/
// admin split. Pure code, no Firestore — also runs on its own with
// `npx vitest run tests/tutorial.test.js`.

import { describe, expect, test } from 'vitest';
import { cardPosition, EDGE, scrollTargetTop, spotlightRect } from '../src/components/tutorial/tutorialLayout.js';
import { USER_TOUR } from '../src/components/tutorial/userTour.js';
import { ADMIN_TOUR } from '../src/components/tutorial/adminTour.js';

const PHONE = { width: 320, height: 640 };
const DESKTOP = { width: 1280, height: 800 };
const CARD = { width: 296, height: 220 };

function inside(pos, card, viewport) {
  return (
    pos.left >= EDGE &&
    pos.top >= EDGE &&
    pos.left + card.width <= viewport.width - EDGE &&
    pos.top + card.height <= viewport.height - EDGE
  );
}

describe('cardPosition', () => {
  test('centres the card when nothing is highlighted', () => {
    const pos = cardPosition({ spot: null, card: CARD, viewport: PHONE });
    expect(pos.side).toBe('center');
    expect(inside(pos, CARD, PHONE)).toBe(true);
  });

  test('goes below an element near the top', () => {
    const spot = { left: 16, top: 80, width: 288, height: 60 };
    const pos = cardPosition({ spot, card: CARD, viewport: PHONE });
    expect(pos.side).toBe('bottom');
    expect(pos.top).toBeGreaterThanOrEqual(spot.top + spot.height);
    expect(inside(pos, CARD, PHONE)).toBe(true);
  });

  test('goes above an element near the bottom, clear of the tab bar', () => {
    const spot = { left: 16, top: 480, width: 288, height: 60 };
    const pos = cardPosition({ spot, card: CARD, viewport: PHONE, insetBottom: 56 });
    expect(pos.side).toBe('top');
    expect(pos.top + CARD.height).toBeLessThanOrEqual(spot.top);
  });

  test('stays on screen for an element taller than the screen', () => {
    const spot = { left: 0, top: 10, width: 320, height: 900 };
    const pos = cardPosition({ spot, card: CARD, viewport: PHONE, insetBottom: 56 });
    expect(inside(pos, CARD, PHONE)).toBe(true);
  });

  test('never runs off the right edge', () => {
    const spot = { left: 1200, top: 100, width: 60, height: 40 };
    const card = { width: 352, height: 220 };
    const pos = cardPosition({ spot, card, viewport: DESKTOP });
    expect(inside(pos, card, DESKTOP)).toBe(true);
  });
});

describe('cardPosition beside tall elements', () => {
  test('sits right of a full-height desktop sidebar', () => {
    const spot = { left: 2, top: 2, width: 228, height: 796 };
    const card = { width: 352, height: 226 };
    const pos = cardPosition({ spot, card, viewport: DESKTOP });
    expect(pos.side).toBe('right');
    expect(pos.left).toBeGreaterThanOrEqual(spot.left + spot.width);
    expect(inside(pos, card, DESKTOP)).toBe(true);
  });
});

describe('scrollTargetTop', () => {
  const base = { cardHeight: 220, viewportHeight: 640, topClearance: 72 };

  test('leaves the page alone when element and card already fit', () => {
    expect(scrollTargetTop({ ...base, rect: { top: 100, height: 80 } })).toBeNull();
  });

  test('makes room for the card under a mid-sized element', () => {
    const top = scrollTargetTop({ ...base, rect: { top: 210, height: 290 } });
    expect(top).toBeGreaterThanOrEqual(72);
    expect(top + 290 + 12 + 220).toBeLessThanOrEqual(640);
  });

  test('top-aligns an element too tall to share the screen', () => {
    expect(scrollTargetTop({ ...base, rect: { top: 900, height: 600 } })).toBe(80);
  });
});

describe('spotlightRect', () => {
  test('keeps the ring inside a narrow screen', () => {
    const r = spotlightRect({ left: 0, top: 50, width: 320, height: 40 }, PHONE);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.left + r.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('returns null for an element fully off screen', () => {
    expect(spotlightRect({ left: 0, top: 900, width: 100, height: 40 }, PHONE)).toBeNull();
  });
});

describe('tours', () => {
  test('the owner tour stays on owner pages', () => {
    for (const step of USER_TOUR.steps) {
      expect(step.route.startsWith('/dashboard')).toBe(true);
      expect(step.targets.some((t) => t.startsWith('admin'))).toBe(false);
      expect(`${step.title} ${step.body}`.toLowerCase()).not.toContain('admin');
    }
  });

  test('the admin tour stays on admin pages', () => {
    for (const step of ADMIN_TOUR.steps) expect(step.route.startsWith('/admin/')).toBe(true);
  });

  test('each tour keeps its own progress', () => {
    expect(USER_TOUR.storageKey).not.toBe(ADMIN_TOUR.storageKey);
  });
});
