// Pure geometry for the guided tour (no DOM access), so it can be unit
// tested: where the spotlight hole goes and where the step card sits.

// Space kept between the card and the screen edge, and between the card and
// the highlighted element.
export const EDGE = 12;
export const GAP = 12;
// Extra room drawn around the highlighted element.
export const SPOT_PAD = 6;

// The hole in the dark overlay: the element's box plus padding, kept inside
// the screen so a very wide element doesn't push the ring off the edge.
export function spotlightRect(rect, viewport) {
  if (!rect) return null;
  const left = Math.max(rect.left - SPOT_PAD, 2);
  const top = Math.max(rect.top - SPOT_PAD, 2);
  const right = Math.min(rect.left + rect.width + SPOT_PAD, viewport.width - 2);
  const bottom = Math.min(rect.top + rect.height + SPOT_PAD, viewport.height - 2);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// Where the step card goes. Below the element if it fits, else above, else
// beside it, else whichever of below/above has more room (the card then covers part of a very tall
// element, but never leaves the screen). No element: centred.
// `insetBottom` is space covered by fixed chrome at the bottom of the
// screen (the owner's phone tab bar), which the card avoids when it can.
export function cardPosition({ spot, card, viewport, insetBottom = 0 }) {
  const maxLeft = viewport.width - card.width - EDGE;
  const maxTop = viewport.height - card.height - EDGE;

  if (!spot) {
    return {
      side: 'center',
      left: clamp((viewport.width - card.width) / 2, EDGE, maxLeft),
      top: clamp((viewport.height - card.height) / 2, EDGE, maxTop),
    };
  }

  const left = clamp(spot.left + spot.width / 2 - card.width / 2, EDGE, maxLeft);
  const floor = viewport.height - insetBottom - EDGE;
  const below = spot.top + spot.height + GAP;
  const above = spot.top - GAP - card.height;

  if (below + card.height <= floor) return { side: 'bottom', left, top: below };
  if (above >= EDGE) return { side: 'top', left, top: above };

  // Tall element with room beside it (the desktop sidebar): sit next to it.
  const sideTop = clamp(spot.top + spot.height / 2 - card.height / 2, EDGE, Math.min(maxTop, floor - card.height));
  if (spot.left + spot.width + GAP + card.width <= viewport.width - EDGE) {
    return { side: 'right', left: spot.left + spot.width + GAP, top: sideTop };
  }
  if (spot.left - GAP - card.width >= EDGE) {
    return { side: 'left', left: spot.left - GAP - card.width, top: sideTop };
  }

  const roomBelow = floor - (spot.top + spot.height);
  const roomAbove = spot.top;
  if (roomBelow >= roomAbove) {
    return { side: 'bottom', left, top: clamp(below, EDGE, floor - card.height) };
  }
  return { side: 'top', left, top: clamp(above, EDGE, maxTop) };
}

// Where the element's top edge should be after scrolling, or null to leave
// the page where it is. The element and the card below it are centred
// together when both fit under the top bar; otherwise the element's top
// goes just under the top bar and the card covers its lower part.
export function scrollTargetTop({ rect, cardHeight, viewportHeight, insetBottom = 0, topClearance }) {
  const floor = viewportHeight - insetBottom;
  const need = cardHeight + GAP + EDGE;
  const bottom = rect.top + rect.height;
  const visible = rect.top >= topClearance && bottom <= floor;
  if (visible && (floor - bottom >= need || rect.top - topClearance >= need)) return null;
  const free = floor - topClearance;
  if (rect.height + need <= free) return topClearance + (free - rect.height - need) / 2;
  return topClearance + 8;
}
