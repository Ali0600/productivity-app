import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { DEFAULT_PET_COLOR, PET_PALETTES } from './petTheme';

/*
 * PetAvatar: the pet ("Mochi"), drawn only with Views, border radii, transforms,
 * LinearGradient and Text emoji.
 *
 * Motion runs on the UI thread through shared values. Idle loops are started per
 * mood in an effect and cancelled in its cleanup. A one-shot `action` (a NEW
 * `action.id`) drives a fixed set of "action channels" (hop, squash, tilt, face
 * overrides...) that always end back at rest; channels an action does not use are
 * settled to rest, so an interrupted action never leaves a pose behind.
 * Transient particles animate themselves on mount and remove themselves through
 * scheduleOnRN, so React state changes only when particles come and go.
 */

export const PET_STAGES = ['egg', 'baby', 'kid', 'teen', 'adult'];
export const PET_MOODS = ['napping', 'peckish', 'fed', 'full'];
export const PET_ACTION_TYPES = ['eat', 'pet', 'cheer', 'wake', 'hatch', 'trick'];
export const PET_TRICKS = [
  'hop',
  'wiggle',
  'spin',
  'bounce',
  'wave',
  'peekaboo',
  'twirl',
  'flip',
  'dance',
  'stretch',
  'roll',
  'sparkle',
];

// Share of the box the whole figure (ears, sprout and tail included) fills.
const STAGE_SCALE = { baby: 0.72, kid: 0.82, teen: 0.92, adult: 1 };
// Younger pets get relatively bigger eyes, the "baby schema" that reads as cute.
const EYE_SCALE = { baby: 1.2, kid: 1.1, teen: 1.04, adult: 1 };
// Blush strength per mood; 'full' is the rosiest.
const CHEEK_LEVEL = { napping: 0.42, peckish: 0.5, fed: 0.62, full: 0.9 };
const MOOD_WORDS = { napping: 'napping', peckish: 'peckish', fed: 'happy', full: 'very happy' };

const MAX_PARTICLES = 12;
const NEVER = ReduceMotion.Never;
const HATCH_SPLIT_MS = 250; // the shell halves fly apart and the baby pops in
const SHELL_MS = 820;
const SHELL_FADE_MS = 450; // the reduced-motion hatch is a plain crossfade
const SPLIT_AT = HATCH_SPLIT_MS / SHELL_MS;
// Leaving a nap waits this long before opening the eyes, so a `wake` action that
// lands a render later (the usual order) closes them first instead of flickering.
const WAKE_GRACE_MS = 140;

const STEM = '#4ade80';
const LEAF = '#86efac';
const LEAF_BACK = '#5fd896';
const Z_COLOR = '#c7d2fe';
const GLOSS = ['rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0.04)'];
const HEARTS = ['💖', '💗'];
const DOT_COLORS = ['#fde68a', '#c7d2fe', '#86efac'];

// The figure's ground line and the centre of its turns, in % of its S x S box.
const GROUND_PCT = 94.5;
const SPIN_PCT = 62.5;
const ORIGIN_BOTTOM = ['50%', '100%', 0];
const ORIGIN_FIGURE_GROUND = ['50%', `${GROUND_PCT}%`, 0];

// The parts each stage draws besides the body and face. PetFigure draws from
// this and figureGeometry outlines from it, so the two cannot disagree.
const STAGE_PARTS = {
  baby: { sprout: true, ears: false, tail: false, tuft: false },
  kid: { sprout: true, ears: true, tail: false, tuft: false },
  teen: { sprout: false, ears: true, tail: true, tuft: false },
  adult: { sprout: false, ears: true, tail: true, tuft: true },
};

const EASE = {
  sine: Easing.inOut(Easing.sin),
  out: Easing.out(Easing.quad),
  in: Easing.in(Easing.quad),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(2)),
  linear: Easing.linear,
};

// Plain timings follow the system Reduce Motion setting. They are only used on
// the full-motion path, which never runs when Reduce Motion is on.
const to = (value, duration, easing = EASE.sine) => withTiming(value, { duration, easing });
const snap = (value) => withTiming(value, { duration: 0 });
// A duration-based spring settles in about 1.5x `duration`, which keeps every
// action inside its 1.2 s budget.
const springTo = (value, duration, dampingRatio) => withSpring(value, { duration, dampingRatio });
// "Never" variants keep playing under Reduce Motion: blinks, crossfades, the
// gentle pulse and the single heart. Children inherit the parent's setting.
const toN = (value, duration, easing = EASE.sine) =>
  withTiming(value, { duration, easing, reduceMotion: NEVER });
const delayN = (ms, animation) => withDelay(ms, animation, NEVER);
const seqN = (...animations) => withSequence(NEVER, ...animations);
const loopN = (animation) => withRepeat(animation, -1, false, undefined, NEVER);

// Rest value of every action channel.
const REST = {
  hopY: 0,
  slideX: 0,
  spin: 0,
  tilt: 0,
  sqX: 1,
  sqY: 1,
  twirl: 0,
  actHappy: 0,
  actClosed: 0,
  actMouth: 0,
  wide: 0,
  pulse: 0,
};

// ---------------------------------------------------------------------------
// Geometry. Everything is computed once per size/stage, so renders only read it.
// ---------------------------------------------------------------------------

const circle = (cx, cy, d) => ({
  position: 'absolute',
  left: cx - d / 2,
  top: cy - d / 2,
  width: d,
  height: d,
  borderRadius: d / 2,
});

// RN has no elliptical corner radii, so an ellipse is a circle stretched on one axis.
const ellipse = (cx, cy, w, h) => {
  const d = Math.min(w, h);
  return { ...circle(cx, cy, d), transform: [w >= h ? { scaleX: w / d } : { scaleY: h / d }] };
};

// A circle with ONE coloured border side draws a soft 90° arc whose chord is
// d·cos45°. The caller sets the colour: borderBottomColor gives a "‿" (closed
// eyes, smile), borderTopColor a "∩" (happy "^ ^" eyes). (cx, cy) is the arc's
// visual middle.
const arc = (cx, cy, chord, thickness, side) => {
  const d = chord / Math.SQRT1_2;
  const r = d / 2;
  const centreY =
    side === 'bottom' ? cy - r * 0.854 + thickness / 2 : cy + r * 0.854 - thickness / 2;
  return {
    position: 'absolute',
    left: cx - r,
    top: centreY - r,
    width: d,
    height: d,
    borderRadius: r,
    borderWidth: thickness,
    borderColor: 'transparent',
  };
};

const shadowGeometry = (cx, cy, w, h) => ({
  box: { position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h },
  ellipse: ellipse(w / 2, h / 2, w, h),
});

// The Reduce Motion "fade pulse": a halo that peeks out around the figure while
// staying inside the box. Two layers fake a soft edge.
const glowGeometry = (cx, cy, w, h) => ({
  outer: ellipse(cx, cy, w, h),
  inner: ellipse(cx, cy, w * 0.86, h * 0.84),
});

// ---------------------------------------------------------------------------
// Staying inside the box. Only particles may leave the size x size box, so the
// figure's outline is kept as a convex hull, and every frame fitTravel moves
// layer A just enough to keep the posed hull inside.
// ---------------------------------------------------------------------------

const ARC_STEPS = 8; // segments per rounded corner
// Corner points sit this much past the radius, so the segments between them
// touch the arc instead of cutting inside it: the outline encloses the shape.
const ARC_PAD = 1 / Math.cos(Math.PI / 4 / ARC_STEPS);
// The most a breath grows the figure on either axis (a nap breathes deepest).
const DEEP_BREATH = 1.05;
const percentOf = (value, length) =>
  typeof value === 'string' ? (parseFloat(value) / 100) * length : value;

/** Points along a laid-out box's rounded outline, after the box's own rotate/scale. */
function outlinePoints(s) {
  const { left, top, width: w, height: h } = s;
  const base = s.borderRadius || 0;
  const tl = s.borderTopLeftRadius ?? base;
  const tr = s.borderTopRightRadius ?? base;
  const br = s.borderBottomRightRadius ?? base;
  const bl = s.borderBottomLeftRadius ?? base;
  // Corner curves that would overlap on a side shrink together, as on screen.
  const shrink = (side, a, b) => (a + b > side ? side / (a + b) : 1);
  const f = Math.min(shrink(w, tl, tr), shrink(w, bl, br), shrink(h, tl, bl), shrink(h, tr, br));
  const corners = [
    [tl * f, tl * f, tl * f, Math.PI],
    [w - tr * f, tr * f, tr * f, Math.PI * 1.5],
    [w - br * f, h - br * f, br * f, 0],
    [bl * f, h - bl * f, bl * f, Math.PI * 0.5],
  ];
  const ox = left + percentOf(s.transformOrigin ? s.transformOrigin[0] : '50%', w);
  const oy = top + percentOf(s.transformOrigin ? s.transformOrigin[1] : '50%', h);
  const transform = s.transform || [];
  const points = [];
  corners.forEach(([cx, cy, r, from]) => {
    for (let i = 0; i <= ARC_STEPS; i += 1) {
      const a = from + (i / ARC_STEPS) * (Math.PI / 2);
      let x = left + cx + r * ARC_PAD * Math.cos(a);
      let y = top + cy + r * ARC_PAD * Math.sin(a);
      // The last transform in the list applies first, as on screen.
      for (let j = transform.length - 1; j >= 0; j -= 1) {
        const t = transform[j];
        const dx = x - ox;
        const dy = y - oy;
        if (t.rotate !== undefined) {
          const rad = (parseFloat(t.rotate) * Math.PI) / 180;
          x = ox + dx * Math.cos(rad) - dy * Math.sin(rad);
          y = oy + dx * Math.sin(rad) + dy * Math.cos(rad);
        } else {
          x = ox + dx * (t.scaleX ?? 1);
          y = oy + dy * (t.scaleY ?? 1);
        }
      }
      points.push([x, y]);
    }
  });
  return points;
}

/** Convex hull (monotone chain), flattened to [x0, y0, x1, y1, ...] for the worklet. */
function hullOf(points) {
  const sorted = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    list.forEach((p) => {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    });
    out.pop();
    return out;
  };
  return half(sorted).concat(half(sorted.slice().reverse())).flat();
}

/**
 * The room around a resting figure, in points, which jumps, slides and turns
 * are sized from so that fitTravel rarely has to step in: `top`, `left` and
 * `right` are the gaps to the box edges, `height` is how far the figure reaches
 * above its ground point and `width` how wide it is. A turn rolls over the
 * outline, so at its tallest angle it stands as tall as the outline's widest
 * span: `turnHop` is how high it can still hop, and `turnSlide` how far it can
 * travel sideways while it turns.
 */
function roomOf({ hull, gy, px, py, ox, oy, size }) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let reach = 0;
  let span = 0;
  for (let i = 0; i < hull.length; i += 2) {
    const x = hull[i];
    const y = hull[i + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    reach = Math.max(reach, Math.hypot(x - px, y - py));
    for (let j = 0; j < i; j += 2) span = Math.max(span, Math.hypot(x - hull[j], y - hull[j + 1]));
  }
  return {
    top: oy + minY,
    left: ox + minX,
    right: size - ox - maxX,
    height: gy - minY,
    width: maxX - minX,
    turnHop: Math.max(0, oy + gy - span * DEEP_BREATH),
    turnSlide: Math.max(0, size / 2 - reach * DEEP_BREATH),
  };
}

// The highest an upright jump can go with the figure still in the box, allowing
// for the take-off stretch and a deep breath. Bigger stages fill more of the
// box, so they jump lower.
const jumpRoom = (geo) => Math.max(0, geo.room.top - geo.room.height * 0.1);

/** Layer C's rotation (deg) and scale; `b` is the breath, 0..1. */
function bodyPose(tilt, sway, sqX, sqY, pulse, b, amp) {
  'worklet';
  const grow = 1 + 0.045 * pulse;
  return [tilt + sway * 3, sqX * (1 + amp * 0.5 * b) * grow, sqY * (1 + amp * b) * grow];
}

const clampInto = (value, lo, hi) => {
  'worklet';
  return lo > hi ? (lo + hi) / 2 : Math.min(Math.max(value, lo), hi);
};

/**
 * Layer A's offset this frame, as [x, y, height above the ground]. Starts from
 * the designed travel (hop, slide, twirl circle); while the figure turns it
 * lifts it by however much deeper the turned outline reaches than the upright
 * one, so it rolls over its own outline instead of sinking into the ground;
 * then it nudges the result so the posed hull stays inside the box.
 */
function fitTravel(fit, twirl, slideX, hopY, spin, rotate, sx, sy) {
  'worklet';
  const { hull, gx, gy, px, py, ox, oy, size, twirlR } = fit;
  const tr = (rotate * Math.PI) / 180;
  const sr = (spin * Math.PI) / 180;
  const cosT = Math.cos(tr);
  const sinT = Math.sin(tr);
  const cosS = Math.cos(sr);
  const sinS = Math.sin(sr);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let upright = -Infinity;
  for (let i = 0; i < hull.length; i += 2) {
    // Layer C: scale, then tilt, about the ground point; relative to the turn centre.
    const dx = (hull[i] - gx) * sx;
    const dy = (hull[i + 1] - gy) * sy;
    const posedX = gx + dx * cosT - dy * sinT - px;
    const posedY = gy + dx * sinT + dy * cosT - py;
    upright = Math.max(upright, posedY);
    // Layer B: the turn.
    const turnedX = posedX * cosS - posedY * sinS;
    const turnedY = posedX * sinS + posedY * cosS;
    minX = Math.min(minX, turnedX);
    maxX = Math.max(maxX, turnedX);
    minY = Math.min(minY, turnedY);
    maxY = Math.max(maxY, turnedY);
  }
  const roll = Math.max(0, maxY - upright);
  const a = twirl * Math.PI * 2;
  const x = clampInto(slideX + twirlR * Math.sin(a), -(ox + px + minX), size - (ox + px + maxX));
  const y = clampInto(
    hopY - twirlR * (1 - Math.cos(a)) - roll,
    -(oy + py + minY),
    size - (oy + py + maxY)
  );
  return [x, y, -(y + roll)];
}

/** The thought bubble beside the head (peckish), with two trailing dots. */
function bubbleGeometry(size, ox, oy, S) {
  const r = size * 0.12;
  const cx = Math.min(ox + S * 0.86, size - r - 1);
  const cy = Math.max(r + 1, oy + S * 0.305 - size * 0.17);
  const from = { x: ox + S * 0.86, y: oy + S * 0.42 };
  const end = { x: cx - r * 0.5, y: cy + r * 0.85 };
  const at = (t) => [from.x + (end.x - from.x) * t, from.y + (end.y - from.y) * t];
  const [x1, y1] = at(0.3);
  const [x2, y2] = at(0.68);
  return {
    origin: [cx, cy, 0],
    main: circle(cx, cy, r * 2),
    dots: [circle(x1, y1, Math.max(2, size * 0.035)), circle(x2, y2, Math.max(3, size * 0.055))],
    berrySize: Math.max(7, Math.round(size * 0.13)),
    rise: size * 0.03, // the pop-in drifts up this far
  };
}

/** Every measurement of a hatched figure, in points inside the size x size box. */
function figureGeometry(size, stage) {
  // The figure is laid out in an S x S square (S = its share of the box) that
  // sits bottom-centred, so smaller stages stand on the same ground line.
  const S = size * STAGE_SCALE[stage];
  const ox = (size - S) / 2;
  const oy = size - S;
  const k = (v) => v * S;

  const bodyLeft = k(0.1);
  const bodyTop = k(0.305);
  // Body-relative point for parts clipped inside the body.
  const local = (x, y) => [k(x) - bodyLeft, k(y) - bodyTop];

  const eyeMul = EYE_SCALE[stage];
  const eyeW = k(0.105 * eyeMul);
  const eyeH = k(0.13 * eyeMul);
  const eyeY = k(0.625);
  const eyes = [-1, 1].map((side) => {
    const cx = k(0.5 + side * 0.135);
    return {
      open: {
        position: 'absolute',
        left: cx - eyeW / 2,
        top: eyeY - eyeH / 2,
        width: eyeW,
        height: eyeH,
        borderRadius: eyeW / 2,
      },
      sparkle: circle(eyeW * 0.64, eyeH * 0.3, Math.max(1.3, eyeW * 0.4)),
      sparkleSmall: eyeW >= 7 ? circle(eyeW * 0.3, eyeH * 0.72, eyeW * 0.18) : null,
      closed: arc(cx, eyeY + eyeH * 0.1, eyeW * 1.3, Math.max(1.2, eyeW * 0.2), 'bottom'),
      happy: arc(cx, eyeY - eyeH * 0.02, eyeW * 1.25, Math.max(1.3, eyeW * 0.22), 'top'),
    };
  });

  const cheeks = [-1, 1].map((side) => {
    const cx = k(0.5 + side * 0.235);
    const cy = k(0.7);
    return { halo: ellipse(cx, cy, k(0.174), k(0.09)), core: ellipse(cx, cy, k(0.12), k(0.062)) };
  });

  const mouthX = k(0.5);
  const mouthY = k(0.68);
  const fullW = k(0.11);
  const openW = k(0.1);
  const openH = k(0.12);
  const mouth = {
    smile: arc(mouthX, mouthY, k(0.095), Math.max(1.2, k(0.017)), 'bottom'),
    relaxed: arc(mouthX, mouthY + k(0.004), k(0.066), Math.max(1.1, k(0.014)), 'bottom'),
    o: ellipse(mouthX, mouthY + k(0.01), k(0.056), k(0.064)),
    // 'full': an open "D" smile with a tongue peeking at the bottom.
    full: {
      position: 'absolute',
      left: mouthX - fullW / 2,
      top: mouthY - fullW * 0.22,
      width: fullW,
      height: fullW / 2,
      borderTopLeftRadius: fullW * 0.08,
      borderTopRightRadius: fullW * 0.08,
      borderBottomLeftRadius: fullW / 2,
      borderBottomRightRadius: fullW / 2,
      overflow: 'hidden',
    },
    fullTongue: circle(fullW / 2, fullW * 0.61, fullW * 0.62),
    // The "O" used to chomp and yawn; scaled by the actMouth channel.
    open: {
      position: 'absolute',
      left: mouthX - openW / 2,
      top: mouthY - openH * 0.3,
      width: openW,
      height: openH,
      borderRadius: openW / 2,
      overflow: 'hidden',
    },
    openTongue: ellipse(openW / 2, openH * 0.9, openW * 0.66, openH * 0.42),
  };

  const ears = [-1, 1].map((side) => ({
    outer: circle(k(0.5 + side * 0.22), k(0.36), k(0.15)),
    inner: circle(k(0.5 + side * 0.212), k(0.336), k(0.078)),
  }));

  // Sprout: a stem and two lens-shaped leaves meeting at its tip. A square with
  // two opposite full-radius corners is a lens along its other diagonal.
  const stemW = k(0.03);
  const stemH = k(0.115);
  const tipX = k(0.517);
  const tipY = k(0.218);
  const leaf = (L, angle) => {
    const half = (L * Math.SQRT2) / 2;
    const rad = (angle * Math.PI) / 180;
    const cx = tipX + Math.cos(rad) * half;
    const cy = tipY + Math.sin(rad) * half;
    return {
      position: 'absolute',
      left: cx - L / 2,
      top: cy - L / 2,
      width: L,
      height: L,
      borderTopRightRadius: L,
      borderBottomLeftRadius: L,
      transform: [{ rotate: `${angle - 45}deg` }],
    };
  };
  const sprout = {
    stem: {
      position: 'absolute',
      left: k(0.505) - stemW / 2,
      top: k(0.33) - stemH,
      width: stemW,
      height: stemH,
      borderRadius: stemW / 2,
      transformOrigin: ORIGIN_BOTTOM,
      transform: [{ rotate: '6deg' }],
    },
    front: leaf(k(0.09), -160),
    back: leaf(k(0.07), -35),
  };

  // Cowlick: two teardrops (one sharp corner, rotated to point up) whose bases
  // hide inside the head.
  const tear = (L, cx, cy, lean) => ({
    position: 'absolute',
    left: cx - L / 2,
    top: cy - L / 2,
    width: L,
    height: L,
    borderTopLeftRadius: 0,
    borderTopRightRadius: L / 2,
    borderBottomRightRadius: L / 2,
    borderBottomLeftRadius: L / 2,
    transform: [{ rotate: `${45 + lean}deg` }],
  });

  const tuft = [tear(k(0.09), k(0.482), k(0.29), -14), tear(k(0.064), k(0.548), k(0.305), 22)];
  const tail = circle(k(0.885), k(0.83), k(0.13));
  const body = {
    position: 'absolute',
    left: bodyLeft,
    top: bodyTop,
    width: k(0.8),
    height: k(0.64),
    // Domed top, flatter bottom: a mochi.
    borderTopLeftRadius: k(0.38),
    borderTopRightRadius: k(0.38),
    borderBottomLeftRadius: k(0.22),
    borderBottomRightRadius: k(0.22),
    overflow: 'hidden',
  };

  // The outline of every part this stage draws (the face and cheeks sit inside
  // the body), in charBox coordinates.
  const parts = STAGE_PARTS[stage];
  const outlined = [body];
  if (parts.tail) outlined.push(tail);
  if (parts.ears) outlined.push(...ears.map((ear) => ear.outer));
  if (parts.sprout) outlined.push(sprout.back, sprout.stem, sprout.front);
  if (parts.tuft) outlined.push(...tuft);
  const groundY = k(GROUND_PCT / 100);
  const fit = {
    hull: hullOf(outlined.flatMap(outlinePoints)),
    gx: S / 2,
    gy: groundY,
    px: S / 2,
    py: k(SPIN_PCT / 100),
    ox,
    oy,
    size,
    twirlR: 0,
  };
  const room = roomOf(fit);
  // The twirl's little circle, sized to clear the nearer side edge with room
  // for its tilt and a breath.
  fit.twirlR = Math.min(size * 0.07, Math.min(room.left, room.right) * 0.6);

  const [bellyX, bellyY] = local(0.5, 0.845);
  const [glossX, glossY] = local(0.3, 0.42);
  const [dotX, dotY] = local(0.405, 0.358);
  const glossShape = ellipse(glossX, glossY, k(0.17), k(0.09));
  const shadowH = Math.max(3, k(0.07));

  return {
    charBox: { position: 'absolute', left: ox, top: oy, width: S, height: S },
    spinOrigin: ['50%', `${SPIN_PCT}%`, 0],
    groundOrigin: ORIGIN_FIGURE_GROUND,
    fit,
    room,
    parts,
    shadow: shadowGeometry(size / 2, oy + k(0.955), k(0.62), shadowH),
    glow: glowGeometry(size / 2, oy + k(0.6), k(0.98), k(0.8)),
    body,
    belly: ellipse(bellyX, bellyY, k(0.34), k(0.16)),
    gloss: {
      ...glossShape,
      overflow: 'hidden',
      transform: [{ rotate: '-30deg' }, ...glossShape.transform],
    },
    glossDot: circle(dotX, dotY, Math.max(1.5, k(0.035))),
    eyes,
    glance: { x: eyeW * 0.12, y: eyeH * 0.16 },
    cheeks,
    mouth,
    ears,
    sprout,
    tuft,
    tail,
    tailGloss: circle(k(0.905), k(0.8), Math.max(1.5, k(0.035))),
    bubble: bubbleGeometry(size, ox, oy, S),
    zOrigin: { x: ox + k(0.7), y: oy + k(0.26) },
    // Anchor points for particles, in box coordinates.
    centreX: size / 2,
    headTop: oy + bodyTop,
    bodyCentreY: oy + k(0.625),
    mouthPoint: { x: ox + mouthX, y: oy + mouthY },
  };
}

/**
 * The egg: the top half of a tall ellipse over a circle. Both pieces are
 * windows onto the same vertical gradient (each reaches its midpoint colour at
 * the equator), so the seam does not show. Also used by the hatch shell.
 */
function eggGeometry(size) {
  const w = size * 0.56;
  const a = w / 2;
  const b2 = size * 0.4; // height of the upper half
  const h = b2 + a;
  const left = (size - w) / 2;
  const top = size * 0.945 - h;

  // The crack zigzags down the middle; the shell halves split along a staircase
  // that follows it (one clip band per step).
  const zig = [0.06, -0.05, 0.06, -0.04];
  const bandH = h / zig.length;
  const bands = zig.map((z, i) => ({
    top: i * bandH,
    height: i === zig.length - 1 ? h - i * bandH : bandH,
    edge: a + z * w,
  }));
  const points = [
    [0.5, 0.05],
    [0.56, 0.17],
    [0.45, 0.38],
    [0.56, 0.6],
    [0.46, 0.8],
    [0.51, 0.95],
  ].map(([x, y]) => [x * w, y * h]);
  const thick = Math.max(1.2, size * 0.02);
  const crack = points.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = points[i];
    const len = Math.hypot(x2 - x1, y2 - y1) + thick;
    return {
      position: 'absolute',
      left: (x1 + x2) / 2 - len / 2,
      top: (y1 + y2) / 2 - thick / 2,
      width: len,
      height: thick,
      borderRadius: thick / 2,
      transform: [{ rotate: `${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI}deg` }],
    };
  });

  const gloss = ellipse(w * 0.3, h * 0.2, w * 0.15, w * 0.24);
  return {
    w,
    h,
    top,
    box: { position: 'absolute', left, top, width: w, height: h },
    lower: {
      position: 'absolute',
      left: 0,
      top: b2 - a,
      width: w,
      height: w,
      borderRadius: a,
      overflow: 'hidden',
    },
    upperClip: { position: 'absolute', left: 0, top: 0, width: w, height: b2, overflow: 'hidden' },
    upper: {
      position: 'absolute',
      left: 0,
      top: b2 - a,
      width: w,
      height: w,
      borderRadius: a,
      overflow: 'hidden',
      transform: [{ scaleY: b2 / a }],
    },
    spots: [
      circle(w * 0.32, h * 0.3, w * 0.17),
      circle(w * 0.66, h * 0.52, w * 0.21),
      circle(w * 0.38, h * 0.74, w * 0.13),
    ],
    gloss: { ...gloss, overflow: 'hidden', transform: [{ rotate: '22deg' }, ...gloss.transform] },
    bands,
    crack,
  };
}

/** Layer, shadow and anchor geometry while the pet is still an egg. */
function eggStageGeometry(size, egg) {
  const centreY = egg.top + egg.h / 2;
  // The egg's outline: the upper half-ellipse and the lower half-circle.
  const a = egg.w / 2;
  const b2 = egg.h - a;
  const cx = egg.box.left + a;
  const cy = egg.box.top + b2;
  const outline = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = (i / 16) * Math.PI;
    outline.push(
      [cx - a * Math.cos(t), cy - b2 * Math.sin(t)],
      [cx - a * Math.cos(t), cy + a * Math.sin(t)]
    );
  }
  return {
    charBox: { position: 'absolute', left: 0, top: 0, width: size, height: size },
    spinOrigin: ['50%', `${(centreY / size) * 100}%`, 0],
    groundOrigin: ORIGIN_FIGURE_GROUND,
    fit: {
      hull: hullOf(outline),
      gx: size / 2,
      gy: size * (GROUND_PCT / 100),
      px: size / 2,
      py: centreY,
      ox: 0,
      oy: 0,
      size,
      twirlR: size * 0.07,
    },
    shadow: shadowGeometry(size / 2, size * 0.955, size * 0.46, Math.max(3, size * 0.06)),
    glow: glowGeometry(size / 2, centreY, size * 0.76, size * 0.78),
    centreX: size / 2,
    headTop: egg.top,
    bodyCentreY: centreY,
  };
}

// ---------------------------------------------------------------------------
// Particle specs. A spec is plain data; <Particle> animates it.
// ---------------------------------------------------------------------------

function hearts(geo, size, count, delay, gap, duration, calm = false) {
  const fontSize = Math.max(10, Math.round(size * 0.15));
  const spread = size * 0.17;
  return Array.from({ length: count }, (_, i) => {
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
    return {
      kind: 'heart',
      glyph: HEARTS[i % HEARTS.length],
      x: geo.centreX + offset,
      y: geo.headTop + size * 0.02,
      dx: calm ? 0 : offset * 0.4,
      dy: calm ? size * 0.08 : size * 0.34,
      wobble: calm ? 0 : size * 0.035,
      delay: delay + i * gap,
      duration,
      size: fontSize,
    };
  });
}

/** Sparkles bursting outward on an arc (default: the upper half) around a point. */
function sparkleRing(cx, cy, count, r0, r1, delay, duration, size, options = {}) {
  const { from = Math.PI, span = Math.PI, dots = false, stagger = 0 } = options;
  const fontSize = Math.max(9, Math.round(size * 0.12));
  const dotSize = Math.max(3, size * 0.045);
  return Array.from({ length: count }, (_, i) => {
    const angle = from + ((i + 0.5) / count) * span;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dot = dots && i % 2 === 1;
    return {
      kind: dot ? 'dot' : 'sparkle',
      glyph: '✨',
      color: DOT_COLORS[i % DOT_COLORS.length],
      x: cx + c * r0,
      y: cy + s * r0,
      dx: c * (r1 - r0),
      dy: s * (r1 - r0),
      delay: delay + i * stagger,
      duration,
      size: dot ? dotSize : fontSize,
      spin: i % 2 === 0 ? 40 : -40,
    };
  });
}

/** One "ta-da" sparkle by the head at the end of a trick. */
const tada = (geo, size, delay) => ({
  kind: 'sparkle',
  glyph: '✨',
  x: geo.centreX + size * 0.26,
  y: geo.headTop,
  dx: size * 0.05,
  dy: -size * 0.1,
  delay,
  duration: 420,
  size: Math.max(10, Math.round(size * 0.13)),
  spin: 35,
});

// ---------------------------------------------------------------------------
// One-shot actions. Each fits in 1.2 s and ends at REST.
// ---------------------------------------------------------------------------

function playTrick(trick, run, parts, geo, size) {
  const happy = (holdMs) =>
    run('actHappy', withSequence(to(1, 110), withDelay(holdMs, to(0, 160))));
  switch (trick) {
    case 'wiggle':
      run(
        'tilt',
        withSequence(
          to(-12, 80),
          to(12, 90),
          to(-12, 90),
          to(12, 90),
          to(-8, 90),
          to(6, 90),
          to(0, 90)
        )
      );
      happy(420);
      parts.push(tada(geo, size, 560));
      break;
    case 'spin': {
      // fitTravel lifts the turn over its own outline; this hop rides on top.
      const up = Math.min(size * 0.06, geo.room.turnHop);
      run('spin', withSequence(to(360, 700, EASE.inOut), snap(0)));
      run('hopY', withSequence(to(-up, 350, EASE.out), to(0, 350, EASE.in)));
      run('sqY', withSequence(withDelay(700, to(0.92, 70)), springTo(1, 240, 0.45)));
      run('sqX', withSequence(withDelay(700, to(1.06, 70)), springTo(1, 240, 0.45)));
      happy(560);
      parts.push(tada(geo, size, 680));
      break;
    }
    case 'bounce': {
      const up = -size * 0.1;
      run(
        'hopY',
        withSequence(
          to(up, 140, EASE.out),
          to(0, 130, EASE.in),
          to(up, 140, EASE.out),
          to(0, 130, EASE.in),
          to(up * 0.8, 130, EASE.out),
          to(0, 120, EASE.in)
        )
      );
      run(
        'sqY',
        withSequence(
          to(1.05, 140),
          to(0.92, 130),
          to(1.05, 140),
          to(0.92, 130),
          to(1.04, 130),
          to(0.9, 120),
          springTo(1, 240, 0.4)
        )
      );
      run(
        'sqX',
        withSequence(
          to(0.96, 140),
          to(1.06, 130),
          to(0.96, 140),
          to(1.06, 130),
          to(0.97, 130),
          to(1.08, 120),
          springTo(1, 240, 0.4)
        )
      );
      happy(640);
      parts.push(tada(geo, size, 700));
      break;
    }
    case 'wave':
      run('tilt', withSequence(to(-10, 180), to(10, 230), to(-10, 230), to(10, 230), to(0, 180)));
      happy(800);
      parts.push(tada(geo, size, 740));
      break;
    case 'peekaboo':
      run('actClosed', withSequence(to(1, 120), withDelay(360, to(0, 70))));
      run('wide', withSequence(withDelay(470, to(1, 110, EASE.back)), withDelay(220, to(0, 220))));
      run('sqY', withSequence(withDelay(470, to(1.08, 100)), springTo(1, 260, 0.45)));
      run('sqX', withSequence(withDelay(470, to(0.95, 100)), springTo(1, 260, 0.45)));
      run(
        'hopY',
        withSequence(withDelay(470, to(-size * 0.04, 100, EASE.out)), to(0, 140, EASE.in))
      );
      parts.push(tada(geo, size, 520));
      break;
    case 'twirl':
      // A small circle path: layer A turns `twirl` (0..1) into x/y.
      run('twirl', withSequence(to(1, 900, EASE.inOut), snap(0)));
      run('tilt', withSequence(to(8, 225), to(-8, 450), to(0, 225)));
      happy(660);
      parts.push(tada(geo, size, 760));
      break;
    case 'flip': {
      // Bigger stages fill more of the box, so their flip is more of a tumble.
      const up = Math.min(size * 0.28, jumpRoom(geo), geo.room.turnHop);
      run('hopY', withSequence(withDelay(100, to(-up, 320, EASE.out)), to(0, 280, EASE.in)));
      run('spin', withSequence(withDelay(150, to(360, 500, EASE.inOut)), snap(0)));
      run(
        'sqY',
        withSequence(
          to(0.86, 100, EASE.out),
          to(1.1, 120),
          to(1, 160),
          withDelay(320, to(0.86, 70)),
          springTo(1, 260, 0.4)
        )
      );
      run(
        'sqX',
        withSequence(
          to(1.1, 100, EASE.out),
          to(0.92, 120),
          to(1, 160),
          withDelay(320, to(1.12, 70)),
          springTo(1, 260, 0.4)
        )
      );
      happy(560);
      parts.push(tada(geo, size, 720));
      break;
    }
    case 'dance': {
      const up = -size * 0.07;
      const beat = () => [to(up, 110, EASE.out), to(0, 140, EASE.in)];
      const bob = () => [to(1.04, 110), to(0.94, 140)];
      run('hopY', withSequence(...beat(), ...beat(), ...beat(), ...beat()));
      run('tilt', withSequence(to(-10, 125), to(10, 250), to(-10, 250), to(10, 250), to(0, 125)));
      run('sqY', withSequence(...bob(), ...bob(), ...bob(), ...bob(), to(1, 120)));
      happy(820);
      parts.push(tada(geo, size, 780));
      break;
    }
    case 'stretch': {
      // Never wider than the box (the adult nearly fills it already).
      const wide = Math.min(1.16, size / (geo.room.width * DEEP_BREATH));
      run(
        'sqY',
        withSequence(
          to(1.2, 300),
          withDelay(90, to(0.84, 300)),
          withDelay(90, springTo(1, 260, 0.45))
        )
      );
      run(
        'sqX',
        withSequence(
          to(0.86, 300),
          withDelay(90, to(wide, 300)),
          withDelay(90, springTo(1, 260, 0.45))
        )
      );
      happy(820);
      parts.push(tada(geo, size, 760));
      break;
    }
    case 'roll': {
      // Rolls out clockwise and back counter-clockwise, like a ball would;
      // fitTravel lifts it over its own outline as it turns. A turning figure
      // reaches as far on every side, so the slide is capped by that reach
      // (the adult fills its box and rolls on the spot).
      const reach = Math.min(size * 0.16, geo.room.turnSlide);
      run('slideX', withSequence(to(reach, 480, EASE.inOut), to(0, 480, EASE.inOut)));
      run('spin', withSequence(to(360, 480, EASE.inOut), to(0, 480, EASE.inOut)));
      happy(800);
      parts.push(tada(geo, size, 760));
      break;
    }
    case 'sparkle':
      happy(760);
      parts.push(
        ...sparkleRing(geo.centreX, geo.bodyCentreY, 5, size * 0.2, size * 0.32, 0, 620, size, {
          from: Math.PI * 0.9,
          span: Math.PI * 1.2,
          stagger: 40,
        }),
        ...sparkleRing(geo.centreX, geo.bodyCentreY, 5, size * 0.3, size * 0.46, 220, 640, size, {
          from: Math.PI * 0.82,
          span: Math.PI * 1.36,
          stagger: 40,
          dots: true,
        })
      );
      break;
    case 'hop':
    default:
      // A high jump: crouch, stretch on take-off, squash on landing.
      run(
        'hopY',
        withSequence(
          withDelay(120, to(-Math.min(size * 0.32, jumpRoom(geo)), 300, EASE.out)),
          to(0, 260, EASE.in)
        )
      );
      run(
        'sqY',
        withSequence(
          to(0.86, 120, EASE.out),
          to(1.12, 120),
          to(1, 180),
          withDelay(260, to(0.86, 70)),
          springTo(1, 260, 0.4)
        )
      );
      run(
        'sqX',
        withSequence(
          to(1.1, 120, EASE.out),
          to(0.92, 120),
          to(1, 180),
          withDelay(260, to(1.12, 70)),
          springTo(1, 260, 0.4)
        )
      );
      happy(500);
      parts.push(tada(geo, size, 700));
  }
}

function playEggAction(type, run, parts, geo, size) {
  const jiggle = (amp) => [
    to(-amp, 100),
    to(amp * 0.85, 120),
    to(-amp * 0.6, 110),
    to(amp * 0.35, 100),
    to(0, 100),
  ];
  switch (type) {
    case 'pet':
      run('tilt', withSequence(...jiggle(8)));
      parts.push(...hearts(geo, size, 2, 140, 160, 760));
      break;
    case 'eat':
      run('tilt', withSequence(...jiggle(6)));
      parts.push(...hearts(geo, size, 1, 200, 0, 800));
      break;
    case 'wake':
      run('tilt', withSequence(...jiggle(6)));
      break;
    case 'hatch':
      // Still an egg (no hatched stage yet): an eager double wobble.
      run('tilt', withSequence(...jiggle(12), ...jiggle(9)));
      parts.push(
        ...sparkleRing(geo.centreX, geo.bodyCentreY, 6, size * 0.22, size * 0.42, 260, 600, size, {
          dots: true,
        })
      );
      break;
    default:
      // cheer and every trick: a little hop and a wobble.
      run('hopY', withSequence(to(-size * 0.08, 160, EASE.out), to(0, 160, EASE.in)));
      run('tilt', withSequence(withDelay(320, to(-7, 100)), to(6, 120), to(-4, 110), to(0, 100)));
      parts.push(
        ...sparkleRing(geo.centreX, geo.bodyCentreY, 4, size * 0.24, size * 0.42, 300, 560, size)
      );
  }
}

/** Starts one action on the channels; returns the particle specs it needs. */
function playAction(act, { ch, geo, size, reduced, isEgg }) {
  const touched = new Set();
  const run = (key, animation) => {
    touched.add(key);
    ch[key].value = animation;
  };
  const parts = [];
  const type = PET_ACTION_TYPES.includes(act.type) ? act.type : 'pet';

  if (reduced) {
    // Reduce Motion: no travel at all. A soft glow-and-scale pulse, a face
    // change and a single heart that barely drifts.
    run('pulse', seqN(toN(1, 200), toN(0, 380)));
    if (!isEgg && type === 'wake') {
      run('actClosed', seqN(toN(1, 0), delayN(300, toN(0, 220))));
    } else if (!isEgg) {
      run('actHappy', seqN(toN(1, 160), delayN(420, toN(0, 220))));
    }
    parts.push(...hearts(geo, size, 1, 120, 0, 900, true));
  } else if (isEgg) {
    playEggAction(type, run, parts, geo, size);
  } else if (type === 'trick') {
    playTrick(PET_TRICKS.includes(act.trick) ? act.trick : 'hop', run, parts, geo, size);
  } else if (type === 'eat') {
    const fromX = size * 0.92;
    const fromY = size * 0.08;
    parts.push({
      kind: 'snack',
      glyph: typeof act.snack === 'string' && act.snack ? act.snack : '🍓',
      x: fromX,
      y: fromY,
      dx: geo.mouthPoint.x - fromX,
      dy: geo.mouthPoint.y - fromY,
      lift: size * 0.1,
      delay: 0,
      duration: 400,
      size: Math.max(12, Math.round(size * 0.2)),
    });
    // Open as the snack arrives, then two chomps.
    run(
      'actMouth',
      withSequence(
        withDelay(260, to(0.9, 120, EASE.out)),
        to(0.15, 90),
        to(0.85, 90),
        to(0.12, 90),
        to(0, 140)
      )
    );
    run(
      'sqY',
      withSequence(withDelay(400, to(0.9, 80)), to(1.02, 90), to(0.92, 80), springTo(1, 260, 0.45))
    );
    run(
      'sqX',
      withSequence(withDelay(400, to(1.08, 80)), to(0.99, 90), to(1.06, 80), springTo(1, 260, 0.45))
    );
    run('actHappy', withSequence(withDelay(700, to(1, 120)), withDelay(200, to(0, 150))));
    parts.push(...hearts(geo, size, 1, 660, 0, 520));
  } else if (type === 'cheer') {
    run(
      'sqY',
      withSequence(
        to(0.88, 110, EASE.out),
        to(1.1, 120, EASE.out),
        to(1, 160),
        withDelay(160, to(0.84, 70)),
        springTo(1, 300, 0.4)
      )
    );
    run(
      'sqX',
      withSequence(
        to(1.08, 110, EASE.out),
        to(0.93, 120, EASE.out),
        to(1, 160),
        withDelay(160, to(1.12, 70)),
        springTo(1, 300, 0.4)
      )
    );
    const up = Math.min(size * 0.2, jumpRoom(geo));
    run('hopY', withSequence(withDelay(110, to(-up, 230, EASE.out)), to(0, 210, EASE.in)));
    run('actHappy', withSequence(withDelay(100, to(1, 120)), withDelay(650, to(0, 160))));
    parts.push(
      ...sparkleRing(geo.centreX, geo.bodyCentreY, 6, size * 0.22, size * 0.44, 540, 560, size, {
        dots: true,
      })
    );
  } else if (type === 'wake') {
    // Eyes start closed, a big stretch and yawn, eyes open, then a little bounce.
    run('actClosed', withSequence(snap(1), withDelay(640, to(0, 130))));
    run('sqY', withSequence(to(1.14, 380), withDelay(140, to(0.94, 140)), to(1, 160)));
    run('sqX', withSequence(to(0.9, 380), withDelay(140, to(1.05, 140)), to(1, 160)));
    run('actMouth', withSequence(withDelay(140, to(1, 260, EASE.out)), withDelay(160, to(0, 180))));
    run('hopY', withSequence(withDelay(820, to(-size * 0.06, 120, EASE.out)), to(0, 130, EASE.in)));
    parts.push(tada(geo, size, 700));
  } else if (type === 'hatch') {
    // The shell and the pop-in animate themselves (EggShell, PetFigure).
    run('actHappy', withSequence(withDelay(420, to(1, 140)), withDelay(380, to(0, 180))));
    parts.push(
      ...sparkleRing(
        geo.centreX,
        geo.bodyCentreY,
        6,
        size * 0.16,
        size * 0.42,
        HATCH_SPLIT_MS,
        600,
        size,
        { dots: true, from: Math.PI * 0.92, span: Math.PI * 1.16 }
      )
    );
  } else {
    // 'pet': squish, "^ ^", hearts.
    run('sqX', withSequence(to(1.12, 110, EASE.out), springTo(1, 380, 0.35)));
    run('sqY', withSequence(to(0.86, 110, EASE.out), springTo(1, 380, 0.35)));
    run('actHappy', withSequence(to(1, 100), withDelay(560, to(0, 160))));
    run('tilt', withSequence(to(-4, 140), to(3, 180), to(0, 180)));
    parts.push(...hearts(geo, size, 3, 120, 140, 760));
  }

  Object.keys(REST).forEach((key) => {
    if (touched.has(key)) return;
    if (key === 'spin' || key === 'twirl') {
      // Finish the nearest whole turn instead of unwinding backwards. Read on the
      // UI thread: reading `.value` from JS would block on a round trip.
      const sv = ch[key];
      const unit = key === 'spin' ? 360 : 1;
      scheduleOnUI(() => {
        'worklet';
        const end = Math.round(sv.value / unit) * unit;
        sv.value = withSequence(
          NEVER,
          withTiming(end, { duration: 160, reduceMotion: NEVER }),
          withTiming(0, { duration: 0, reduceMotion: NEVER })
        );
      });
      return;
    }
    ch[key].value = toN(REST[key], 160);
  });
  return parts;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const EggShape = memo(function EggShape({ egg, palette }) {
  const colors = [palette.top, palette.bottom];
  return (
    <View style={{ width: egg.w, height: egg.h }}>
      <View style={egg.lower}>
        <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
      </View>
      <View style={egg.upperClip}>
        <View style={egg.upper}>
          <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
        </View>
      </View>
      {egg.spots.map((spot, i) => (
        <View key={i} style={[spot, styles.eggSpot, { backgroundColor: palette.accent }]} />
      ))}
      <View style={egg.gloss}>
        <LinearGradient colors={GLOSS} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
});

/** The resting egg, wobbling every few seconds. */
const EggIdle = memo(function EggIdle({ egg, palette, reduced }) {
  const wobble = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    wobble.value = withRepeat(
      withSequence(withDelay(2400, to(-7, 150)), to(6, 170), to(-4, 150), to(2, 130), to(0, 130)),
      -1
    );
    return () => cancelAnimation(wobble);
  }, [reduced, wobble]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${wobble.value}deg` }] }));
  return (
    <Animated.View style={[egg.box, styles.originBottom, style]}>
      <EggShape egg={egg} palette={palette} />
    </Animated.View>
  );
});

function CrackSegment({ segment, index, count, progress, ink }) {
  // Segments appear one after another down the egg during the shake.
  const start = SPLIT_AT * (0.15 + (index / count) * 0.6);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, start + 0.04], [0, 0.75], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[segment, { backgroundColor: ink }, style]} />;
}

function ShellHalf({ side, egg, palette, progress, size }) {
  const fly = size * 0.2;
  const lift = size * 0.07;
  const drop = size * 0.05;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const u = p <= SPLIT_AT ? 0 : (p - SPLIT_AT) / (1 - SPLIT_AT);
    const e = 1 - (1 - u) * (1 - u) * (1 - u);
    return {
      opacity: p < SPLIT_AT ? 0 : interpolate(u, [0, 0.55, 1], [1, 0.9, 0]),
      transform: [
        { translateX: side * fly * e },
        { translateY: interpolate(u, [0, 0.35, 1], [0, -lift, drop]) },
        { rotate: `${side * 24 * e}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[egg.box, side < 0 ? styles.originLeftHalf : styles.originRightHalf, style]}
    >
      {egg.bands.map((band, i) => {
        const left = side < 0 ? 0 : band.edge;
        const width = side < 0 ? band.edge : egg.w - band.edge;
        return (
          <View key={i} style={[styles.clip, { left, top: band.top, width, height: band.height }]}>
            <View style={{ position: 'absolute', left: -left, top: -band.top }}>
              <EggShape egg={egg} palette={palette} />
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}

/**
 * The hatch overlay: the egg shakes while a crack runs down it, then splits into
 * two halves that fly apart and fade. Removes itself through `onDone`.
 */
const EggShell = memo(function EggShell({ id, egg, palette, reduced, size, onDone }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: reduced ? SHELL_FADE_MS : SHELL_MS, easing: EASE.linear, reduceMotion: NEVER },
      () => {
        'worklet';
        scheduleOnRN(onDone, id);
      }
    );
    return () => cancelAnimation(progress);
  }, [id, onDone, progress, reduced]);
  const intactStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduced) return { opacity: 1 - p };
    const shake = interpolate(
      p,
      [0, SPLIT_AT * 0.25, SPLIT_AT * 0.5, SPLIT_AT * 0.75, SPLIT_AT],
      [0, -7, 7, -4, 0],
      Extrapolation.CLAMP
    );
    return { opacity: p < SPLIT_AT ? 1 : 0, transform: [{ rotate: `${shake}deg` }] };
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[egg.box, styles.originBottom, intactStyle]}>
        <EggShape egg={egg} palette={palette} />
        {reduced
          ? null
          : egg.crack.map((segment, i) => (
              <CrackSegment
                key={i}
                segment={segment}
                index={i}
                count={egg.crack.length}
                progress={progress}
                ink={palette.ink}
              />
            ))}
      </Animated.View>
      {reduced ? null : (
        <>
          <ShellHalf side={-1} egg={egg} palette={palette} progress={progress} size={size} />
          <ShellHalf side={1} egg={egg} palette={palette} progress={progress} size={size} />
        </>
      )}
    </View>
  );
});

/** One eye: open (glossy, blinking), closed "‿" and happy "∩" crossfade. */
const Eye = memo(function Eye({ eye, glance, ink, face }) {
  const { blink, moodClosed, actClosed, moodHappy, actHappy, wide, glance: look } = face;
  const gx = glance.x;
  const gy = glance.y;
  const openStyle = useAnimatedStyle(() => {
    const closed = Math.max(moodClosed.value, actClosed.value);
    const happy = Math.max(moodHappy.value, actHappy.value);
    const big = 1 + 0.22 * wide.value;
    return {
      opacity: (1 - closed) * (1 - happy),
      transform: [
        { translateX: look.value * gx },
        { translateY: -look.value * gy },
        { scaleX: big },
        { scaleY: blink.value * big },
      ],
    };
  });
  const closedStyle = useAnimatedStyle(() => ({
    opacity:
      Math.max(moodClosed.value, actClosed.value) * (1 - Math.max(moodHappy.value, actHappy.value)),
  }));
  const happyStyle = useAnimatedStyle(() => ({
    opacity: Math.max(moodHappy.value, actHappy.value),
  }));
  return (
    <>
      <Animated.View style={[eye.open, { backgroundColor: ink }, openStyle]}>
        <View style={[eye.sparkle, styles.sparkle]} />
        {eye.sparkleSmall ? <View style={[eye.sparkleSmall, styles.sparkleSmall]} /> : null}
      </Animated.View>
      <Animated.View style={[eye.closed, { borderBottomColor: ink }, closedStyle]} />
      <Animated.View style={[eye.happy, { borderTopColor: ink }, happyStyle]} />
    </>
  );
});

/** The mood's resting mouth, swapped for an "O" while chomping or yawning. */
const Mouth = memo(function Mouth({ mouth, mood, ink, tongue, actMouth }) {
  const restStyle = useAnimatedStyle(() => ({
    opacity: interpolate(actMouth.value, [0, 0.08], [1, 0], Extrapolation.CLAMP),
  }));
  const openStyle = useAnimatedStyle(() => {
    const m = actMouth.value;
    return {
      opacity: interpolate(m, [0, 0.08], [0, 1], Extrapolation.CLAMP),
      transform: [{ scaleX: 0.55 + 0.45 * m }, { scaleY: 0.18 + 0.82 * m }],
    };
  });
  let rest;
  if (mood === 'napping') {
    rest = <View style={[mouth.relaxed, { borderBottomColor: ink }]} />;
  } else if (mood === 'peckish') {
    rest = <View style={[mouth.o, { backgroundColor: ink }]} />;
  } else if (mood === 'full') {
    rest = (
      <View style={[mouth.full, { backgroundColor: ink }]}>
        <View style={[mouth.fullTongue, { backgroundColor: tongue }]} />
      </View>
    );
  } else {
    rest = <View style={[mouth.smile, { borderBottomColor: ink }]} />;
  }
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, restStyle]}>
        {rest}
      </Animated.View>
      <Animated.View style={[mouth.open, styles.originMouth, { backgroundColor: ink }, openStyle]}>
        <View style={[mouth.openTongue, { backgroundColor: tongue }]} />
      </Animated.View>
    </>
  );
});

/**
 * The hatched figure. `entrance` is read once, at mount: 'hatch' pops it in from
 * 0.3 as the shell splits, 'grow' gives a small pop after a stage change.
 */
const PetFigure = memo(function PetFigure({ geo, palette, mood, face, entrance, reduced }) {
  const [enter] = useState(entrance);
  const pop = useSharedValue(reduced || !enter ? 1 : enter === 'hatch' ? 0.3 : 0.84);
  const fade = useSharedValue(enter === 'hatch' ? 0 : 1);
  useEffect(() => {
    if (enter === 'hatch' && reduced) {
      fade.value = toN(1, SHELL_FADE_MS);
    } else if (enter === 'hatch') {
      fade.value = withDelay(HATCH_SPLIT_MS - 20, to(1, 90));
      pop.value = withDelay(HATCH_SPLIT_MS, springTo(1, 420, 0.45));
    } else if (enter === 'grow' && !reduced) {
      pop.value = springTo(1, 380, 0.45);
    }
    return () => {
      cancelAnimation(pop);
      cancelAnimation(fade);
    };
  }, [enter, reduced, pop, fade]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: pop.value }],
  }));

  const cheek = CHEEK_LEVEL[mood];
  const { sprout: hasSprout, ears: hasEars, tail: hasTail, tuft: hasTuft } = geo.parts;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.originFigure, popStyle]}>
      {/* Parts drawn before the body tuck behind it. */}
      {hasTail ? (
        <>
          <View style={[geo.tail, { backgroundColor: palette.bottom }]} />
          <View style={[geo.tailGloss, styles.tailGloss]} />
        </>
      ) : null}
      {hasEars
        ? geo.ears.map((ear, i) => (
            <Fragment key={i}>
              <View style={[ear.outer, { backgroundColor: palette.top }]} />
              <View style={[ear.inner, styles.earInner, { backgroundColor: palette.cheek }]} />
            </Fragment>
          ))
        : null}
      {hasSprout ? (
        <>
          <View style={[geo.sprout.back, { backgroundColor: LEAF_BACK }]} />
          <View style={[geo.sprout.stem, { backgroundColor: STEM }]} />
          <View style={[geo.sprout.front, { backgroundColor: LEAF }]} />
        </>
      ) : null}
      {hasTuft
        ? geo.tuft.map((tuft, i) => (
            <View key={i} style={[tuft, { backgroundColor: palette.top }]} />
          ))
        : null}

      <View style={geo.body}>
        <LinearGradient colors={[palette.top, palette.bottom]} style={StyleSheet.absoluteFill} />
        <View style={[geo.belly, styles.belly, { backgroundColor: palette.belly }]} />
        <View style={geo.gloss}>
          <LinearGradient colors={GLOSS} style={StyleSheet.absoluteFill} />
        </View>
        <View style={[geo.glossDot, styles.glossDot]} />
      </View>

      {geo.cheeks.map((c, i) => (
        <Fragment key={i}>
          <View style={[c.halo, { backgroundColor: palette.cheek, opacity: cheek * 0.35 }]} />
          <View style={[c.core, { backgroundColor: palette.cheek, opacity: cheek }]} />
        </Fragment>
      ))}
      <Eye eye={geo.eyes[0]} glance={geo.glance} ink={palette.ink} face={face} />
      <Eye eye={geo.eyes[1]} glance={geo.glance} ink={palette.ink} face={face} />
      <Mouth
        mouth={geo.mouth}
        mood={mood}
        ink={palette.ink}
        tongue={palette.cheek}
        actMouth={face.actMouth}
      />
    </Animated.View>
  );
});

/** A "z" that drifts up and fades, every 4.4 s (two of them, half a cycle apart). */
const DriftZ = memo(function DriftZ({ x, y, fontSize, delay, rise, drift, reduced }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = delayN(delay, loopN(withTiming(1, { duration: 4400, easing: EASE.linear })));
    return () => cancelAnimation(t);
  }, [delay, t]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    // Reduce Motion: the z only fades in place.
    const m = reduced ? 0 : 1;
    return {
      opacity: interpolate(p, [0, 0.12, 0.65, 1], [0, 0.95, 0.7, 0]),
      transform: [
        { translateX: m * (drift * p + Math.sin(p * Math.PI * 2) * fontSize * 0.15) },
        { translateY: -m * rise * p },
        { scale: 1 - m * (0.4 - 0.55 * p) },
        { rotate: `${m * (-12 + 18 * p)}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.center,
        { left: x - fontSize, top: y - fontSize, width: fontSize * 2, height: fontSize * 2 },
        style,
      ]}
    >
      <Text allowFontScaling={false} style={[styles.z, { fontSize, lineHeight: fontSize * 1.25 }]}>
        z
      </Text>
    </Animated.View>
  );
});

/** Every ~7 s a little 🍓 thought pops up beside the head for about 1.5 s. */
const ThoughtBubble = memo(function ThoughtBubble({ bubble, reduced }) {
  const show = useSharedValue(0);
  useEffect(() => {
    show.value = loopN(withSequence(withDelay(5500, to(1, 250)), withDelay(1000, to(0, 250))));
    return () => cancelAnimation(show);
  }, [show]);
  const rise = bubble.rise;
  const style = useAnimatedStyle(() => {
    const v = show.value;
    const m = reduced ? 0 : 1;
    return {
      opacity: v,
      transform: [{ translateY: m * (1 - v) * rise }, { scale: 1 - m * 0.3 * (1 - v) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transformOrigin: bubble.origin }, style]}
    >
      <View style={[bubble.dots[0], styles.bubble]} />
      <View style={[bubble.dots[1], styles.bubble]} />
      <View style={[bubble.main, styles.bubble, styles.center]}>
        <Text
          allowFontScaling={false}
          style={{ fontSize: bubble.berrySize, lineHeight: bubble.berrySize * 1.25 }}
        >
          🍓
        </Text>
      </View>
    </Animated.View>
  );
});

/** A transient particle: animates once on mount, then asks to be removed. */
const Particle = memo(function Particle({ p, onDone }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const id = p.id;
    t.value = delayN(
      p.delay,
      withTiming(1, { duration: p.duration, easing: EASE.linear }, () => {
        'worklet';
        scheduleOnRN(onDone, id);
      })
    );
    return () => cancelAnimation(t);
  }, [p, onDone, t]);
  const { kind, dx, dy, wobble = 0, spin = 0, lift = 0 } = p;
  const style = useAnimatedStyle(() => {
    const v = t.value;
    if (kind === 'heart') {
      const rise = 1 - (1 - v) * (1 - v);
      return {
        opacity: interpolate(v, [0, 0.12, 0.65, 1], [0, 1, 1, 0]),
        transform: [
          { translateX: dx * v + Math.sin(v * Math.PI * 2) * wobble },
          { translateY: -dy * rise },
          { scale: interpolate(v, [0, 0.15, 1], [0.4, 1, 0.85]) },
          { rotate: '0deg' },
        ],
      };
    }
    if (kind === 'snack') {
      const e = v * v * (3 - 2 * v);
      return {
        opacity: interpolate(v, [0, 0.05, 0.85, 1], [0, 1, 1, 0]),
        transform: [
          { translateX: dx * e },
          { translateY: dy * e - lift * Math.sin(Math.PI * e) },
          { scale: interpolate(v, [0, 0.7, 1], [1, 0.75, 0.2]) },
          { rotate: `${-25 * e}deg` },
        ],
      };
    }
    // Sparkles and dots burst outward, twinkle and fade.
    const e = 1 - (1 - v) * (1 - v);
    return {
      opacity: interpolate(v, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: dx * e },
        { translateY: dy * e },
        { scale: interpolate(v, [0, 0.35, 1], [0.2, 1.15, 0.5]) },
        { rotate: `${spin * v}deg` },
      ],
    };
  });
  const box = Math.max(8, p.size * 1.6);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.center,
        { left: p.x - box / 2, top: p.y - box / 2, width: box, height: box },
        style,
      ]}
    >
      {kind === 'dot' ? (
        <View
          style={{
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
          }}
        />
      ) : (
        <Text allowFontScaling={false} style={{ fontSize: p.size, lineHeight: p.size * 1.25 }}>
          {p.glyph}
        </Text>
      )}
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// PetAvatar
// ---------------------------------------------------------------------------

function PetAvatar({
  size = 120,
  stage = 'baby',
  mood = 'fed',
  color = DEFAULT_PET_COLOR,
  action = null,
  onPress,
  accessibilityLabel,
}) {
  const reduced = useReducedMotion();
  const box = Number.isFinite(size) && size > 0 ? size : 120;
  const st = PET_STAGES.includes(stage) ? stage : 'baby';
  const md = PET_MOODS.includes(mood) ? mood : 'fed';
  const isEgg = st === 'egg';
  // An own-key check, so inherited names such as 'constructor' fall back too.
  const palette =
    PET_PALETTES[
      Object.prototype.hasOwnProperty.call(PET_PALETTES, color) ? color : DEFAULT_PET_COLOR
    ];
  const egg = useMemo(() => eggGeometry(box), [box]);
  const geo = useMemo(
    () => (isEgg ? eggStageGeometry(box, egg) : figureGeometry(box, st)),
    [box, st, isEgg, egg]
  );

  // Mood channels (idle loops).
  const breath = useSharedValue(0);
  const blink = useSharedValue(1);
  const moodClosed = useSharedValue(md === 'napping' ? 1 : 0);
  const moodHappy = useSharedValue(0);
  const sway = useSharedValue(0);
  const glance = useSharedValue(0);
  // Action channels (one-shots); every action ends them at REST.
  const hopY = useSharedValue(REST.hopY);
  const slideX = useSharedValue(REST.slideX);
  const spin = useSharedValue(REST.spin);
  const tilt = useSharedValue(REST.tilt);
  const sqX = useSharedValue(REST.sqX);
  const sqY = useSharedValue(REST.sqY);
  const twirl = useSharedValue(REST.twirl);
  const actHappy = useSharedValue(REST.actHappy);
  const actClosed = useSharedValue(REST.actClosed);
  const actMouth = useSharedValue(REST.actMouth);
  const wide = useSharedValue(REST.wide);
  const pulse = useSharedValue(REST.pulse);

  const ch = useMemo(
    () => ({
      hopY,
      slideX,
      spin,
      tilt,
      sqX,
      sqY,
      twirl,
      actHappy,
      actClosed,
      actMouth,
      wide,
      pulse,
    }),
    [hopY, slideX, spin, tilt, sqX, sqY, twirl, actHappy, actClosed, actMouth, wide, pulse]
  );
  const face = useMemo(
    () => ({ blink, moodClosed, actClosed, moodHappy, actHappy, wide, glance, actMouth }),
    [blink, moodClosed, actClosed, moodHappy, actHappy, wide, glance, actMouth]
  );

  // What to play, derived during render so a hatch never paints a frame of an
  // un-hatched pet. An action already present at mount counts as seen, so a
  // newly mounted screen never replays it.
  const [track, setTrack] = useState(() => ({
    stage: st,
    actionId: action && typeof action === 'object' ? action.id : null,
    act: null,
    shellId: null,
    seq: 0,
    figureKey: 0,
    entrance: null,
  }));
  let next = track;
  if (st !== track.stage) {
    // Hatching IS the egg -> hatched transition, so it starts here even when the
    // `hatch` action arrives a render later (the usual order from pet events).
    const hatched = track.stage === 'egg' && !isEgg;
    const seq = next.seq + 1;
    next = {
      ...next,
      stage: st,
      seq,
      figureKey: isEgg ? next.figureKey : next.figureKey + 1,
      entrance: hatched ? 'hatch' : 'grow',
      shellId: hatched ? seq : isEgg ? null : next.shellId,
      act: hatched ? { type: 'hatch', id: `stage-${seq}` } : next.act,
    };
  }
  // Object.is, so an id that never equals itself (NaN) cannot re-trigger every render.
  if (action && typeof action === 'object' && !Object.is(action.id, next.actionId)) {
    const hatch = action.type === 'hatch' && !isEgg;
    if (hatch && next.shellId !== null) {
      // That hatch is already on screen (started by the stage change).
      next = { ...next, actionId: action.id };
    } else if (hatch) {
      const seq = next.seq + 1;
      next = {
        ...next,
        actionId: action.id,
        act: action,
        seq,
        shellId: seq,
        figureKey: next.figureKey + 1,
        entrance: 'hatch',
      };
    } else {
      next = { ...next, actionId: action.id, act: action };
    }
  }
  if (next !== track) setTrack(next);

  const endShell = useCallback(
    (id) => setTrack((t) => (t.shellId === id ? { ...t, shellId: null } : t)),
    []
  );

  const [particles, setParticles] = useState([]);
  const nextParticleId = useRef(1);
  const removeParticle = useCallback(
    (id) =>
      setParticles((list) =>
        list.some((p) => p.id === id) ? list.filter((p) => p.id !== id) : list
      ),
    []
  );
  const spawn = useCallback((specs) => {
    const now = Date.now();
    const added = specs.map((spec) => ({
      ...spec,
      id: nextParticleId.current++,
      startAt: now + spec.delay,
    }));
    setParticles((list) => {
      // A new action also drops the earlier action's particles that have not
      // started yet, so they do not burst in the middle of it. Unmounting one
      // cancels its animation, and its removal then finds nothing to remove.
      const kept = list.filter((p) => p.startAt <= now);
      if (added.length === 0 && kept.length === list.length) return list;
      const all = kept.concat(added);
      return all.length > MAX_PARTICLES ? all.slice(all.length - MAX_PARTICLES) : all;
    });
  }, []);

  // Idle loops for the current mood.
  useEffect(() => {
    const napping = !isEgg && md === 'napping';
    const awake = !isEgg && !napping;
    moodClosed.value = napping ? toN(1, 260) : delayN(WAKE_GRACE_MS, toN(0, 260));
    // Breathing keeps going during a nap (slower and deeper); it starts from 0
    // so a restarted loop keeps its full range.
    breath.value =
      isEgg || reduced
        ? toN(0, 200)
        : withSequence(to(0, 200), withRepeat(to(1, napping ? 1800 : 1200), -1, true));
    // Opens the eyes before the loop: this effect re-runs on every mood change
    // (peckish -> fed when a snack is eaten), and a loop that opened straight
    // into its first delay would hold a cancelled mid-blink squint for 3.2 s.
    blink.value = awake
      ? seqN(
          toN(1, 80),
          loopN(
            withSequence(
              withDelay(3200, to(0.1, 60)),
              withDelay(40, to(1, 80)),
              withDelay(3600, to(0.1, 60)),
              withDelay(40, to(1, 80)),
              withDelay(2600, to(0.1, 55)),
              withDelay(30, to(1, 70)),
              withDelay(120, to(0.1, 55)),
              withDelay(30, to(1, 80))
            )
          )
        )
      : toN(1, 120);
    // 'full' sometimes flicks to happy "^ ^" eyes (a blink variant, so it stays
    // on under Reduce Motion) and sways gently (which does not).
    moodHappy.value =
      awake && md === 'full'
        ? loopN(withSequence(withDelay(4600, to(1, 140)), withDelay(1100, to(0, 180))))
        : toN(0, 150);
    sway.value =
      awake && md === 'full' && !reduced
        ? withSequence(to(1, 800), withRepeat(to(-1, 1600), -1, true))
        : toN(0, 400);
    // 'peckish' glances up at its thought bubble; same 7 s period, so they stay in step.
    glance.value =
      awake && md === 'peckish' && !reduced
        ? withRepeat(withSequence(withDelay(5450, to(1, 220)), withDelay(1100, to(0, 230))), -1)
        : toN(0, 200);
    return () => {
      cancelAnimation(moodClosed);
      cancelAnimation(breath);
      cancelAnimation(blink);
      cancelAnimation(moodHappy);
      cancelAnimation(sway);
      cancelAnimation(glance);
    };
  }, [isEgg, md, reduced, moodClosed, breath, blink, moodHappy, sway, glance]);

  // One-shot actions. The ref keeps each one to a single play however often the
  // effect re-runs.
  const played = useRef(null);
  useEffect(() => {
    const act = track.act;
    if (!act || played.current === act) return;
    played.current = act;
    spawn(playAction(act, { ch, geo, size: box, reduced, isEgg }));
  }, [track.act, ch, geo, box, reduced, isEgg, spawn]);

  useEffect(
    () => () => {
      Object.values(ch).forEach((value) => cancelAnimation(value));
    },
    [ch]
  );

  const fit = geo.fit;
  const liftRef = box * 0.3;
  const breathAmp = md === 'napping' ? 0.05 : 0.035;
  // Layer A: travel (hops, slides, the twirl circle), fitted inside the box by
  // fitTravel. It sizes the pose at full breath, so it need not re-run on
  // every breathing frame.
  const travelStyle = useAnimatedStyle(() => {
    const [r, sx, sy] = bodyPose(
      tilt.value,
      sway.value,
      sqX.value,
      sqY.value,
      pulse.value,
      1,
      breathAmp
    );
    const [x, y] = fitTravel(fit, twirl.value, slideX.value, hopY.value, spin.value, r, sx, sy);
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  // Layer B: spins, around the middle of the body.
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // Layer C: tilt, squash-and-stretch, breathing and the pulse, anchored on the ground.
  const bodyStyle = useAnimatedStyle(() => {
    const [r, sx, sy] = bodyPose(
      tilt.value,
      sway.value,
      sqX.value,
      sqY.value,
      pulse.value,
      breath.value,
      breathAmp
    );
    return { transform: [{ rotate: `${r}deg` }, { scaleX: sx }, { scaleY: sy }] };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const [r, sx, sy] = bodyPose(
      tilt.value,
      sway.value,
      sqX.value,
      sqY.value,
      pulse.value,
      1,
      breathAmp
    );
    const [x, , height] = fitTravel(
      fit,
      twirl.value,
      slideX.value,
      hopY.value,
      spin.value,
      r,
      sx,
      sy
    );
    const k = 1 - Math.min(1, Math.max(0, height) / liftRef) * 0.55;
    return { opacity: 0.4 + 0.6 * k, transform: [{ translateX: x }, { scale: k }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.55 * pulse.value }));

  const zSize = Math.max(9, Math.round(box * 0.15));
  const content = (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
        <View style={[geo.glow.outer, styles.glowOuter, { backgroundColor: palette.accent }]} />
        <View style={[geo.glow.inner, styles.glowInner, { backgroundColor: palette.accent }]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[geo.shadow.box, shadowStyle]}>
        <View style={[geo.shadow.ellipse, styles.shadow]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[geo.charBox, travelStyle]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transformOrigin: geo.spinOrigin }, spinStyle]}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { transformOrigin: geo.groundOrigin }, bodyStyle]}
          >
            {isEgg ? (
              <EggIdle egg={egg} palette={palette} reduced={reduced} />
            ) : (
              <PetFigure
                key={track.figureKey}
                geo={geo}
                palette={palette}
                mood={md}
                face={face}
                entrance={track.entrance}
                reduced={reduced}
              />
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {!isEgg && md === 'peckish' ? <ThoughtBubble bubble={geo.bubble} reduced={reduced} /> : null}
      {!isEgg && md === 'napping' ? (
        <>
          <DriftZ
            x={geo.zOrigin.x}
            y={geo.zOrigin.y}
            fontSize={zSize}
            delay={0}
            rise={box * 0.3}
            drift={box * 0.1}
            reduced={reduced}
          />
          <DriftZ
            x={geo.zOrigin.x + box * 0.08}
            y={geo.zOrigin.y - box * 0.08}
            fontSize={Math.round(zSize * 0.8)}
            delay={2200}
            rise={box * 0.26}
            drift={box * 0.08}
            reduced={reduced}
          />
        </>
      ) : null}
      {!isEgg && track.shellId !== null ? (
        <EggShell
          key={track.shellId}
          id={track.shellId}
          egg={egg}
          palette={palette}
          reduced={reduced}
          size={box}
          onDone={endShell}
        />
      ) : null}
      {particles.map((p) => (
        <Particle key={p.id} p={p} onDone={removeParticle} />
      ))}
    </>
  );

  const pressable = typeof onPress === 'function';
  // Without a label or a tap handler the pet is decoration: keep it out of VoiceOver.
  const announced = pressable || !!accessibilityLabel;
  const label = accessibilityLabel || (isEgg ? 'Pet egg' : `Pet, ${MOOD_WORDS[md]}`);
  let role;
  if (pressable) role = 'button';
  else if (announced) role = 'image';
  // Always the same root element, so gaining or losing `onPress` never remounts
  // the pet and restarts its animations. Without a handler it takes no touches
  // (pointerEvents rather than `disabled`, which VoiceOver would read as "dimmed").
  return (
    <Pressable
      onPress={pressable ? onPress : undefined}
      pointerEvents={pressable ? 'auto' : 'none'}
      focusable={pressable}
      accessible={announced}
      accessibilityRole={role}
      accessibilityLabel={announced ? label : undefined}
      accessibilityElementsHidden={!announced}
      importantForAccessibility={announced ? 'auto' : 'no-hide-descendants'}
      style={[styles.box, { width: box, height: box }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'visible',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: {
    position: 'absolute',
    overflow: 'hidden',
  },
  originBottom: {
    transformOrigin: ORIGIN_BOTTOM,
  },
  originFigure: {
    transformOrigin: ORIGIN_FIGURE_GROUND,
  },
  originLeftHalf: {
    transformOrigin: ['25%', '50%', 0],
  },
  originRightHalf: {
    transformOrigin: ['75%', '50%', 0],
  },
  originMouth: {
    transformOrigin: ['50%', '30%', 0],
  },
  shadow: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  belly: {
    opacity: 0.65,
  },
  glowOuter: {
    opacity: 0.45,
  },
  glowInner: {
    opacity: 0.8,
  },
  glossDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  earInner: {
    opacity: 0.75,
  },
  tailGloss: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  sparkle: {
    backgroundColor: 'white',
  },
  sparkleSmall: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  eggSpot: {
    opacity: 0.5,
  },
  z: {
    color: Z_COLOR,
    fontWeight: '800',
  },
  bubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
});

// memo skips a render only when every prop is unchanged, so it helps only
// callers that pass a stable `onPress`: an inline arrow re-renders the pet with
// its parent (cheap, as the inner parts are memoized themselves).
export default memo(PetAvatar);
