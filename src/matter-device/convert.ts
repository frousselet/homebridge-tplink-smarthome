import type { MatterClusters } from '../matter-types';

/**
 * Unit conversions between TP-Link (Kasa) values and Matter cluster values.
 *
 * - TP-Link brightness: 0-100 (%), Matter LevelControl: 1-254
 * - TP-Link hue: 0-360 (degrees), Matter ColorControl hue: 0-254
 * - TP-Link saturation: 0-100 (%), Matter ColorControl saturation: 0-254
 * - Matter ColorControl x/y: value * 65536, max 65279
 */

export const MATTER_MIN_LEVEL = 1;
export const MATTER_MAX_LEVEL = 254;
const MATTER_MAX_HUE = 254;
const MATTER_MAX_SATURATION = 254;
const MATTER_MAX_XY = 65279;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentToMatterLevel(percent: number): number {
  return clamp(
    Math.round((percent * MATTER_MAX_LEVEL) / 100),
    MATTER_MIN_LEVEL,
    MATTER_MAX_LEVEL
  );
}

export function matterLevelToPercent(level: number): number {
  return clamp(Math.round((level * 100) / MATTER_MAX_LEVEL), 1, 100);
}

export function hueToMatter(degrees: number): number {
  return clamp(Math.round((degrees * MATTER_MAX_HUE) / 360), 0, MATTER_MAX_HUE);
}

export function matterHueToDegrees(hue: number): number {
  return clamp(Math.round((hue * 360) / MATTER_MAX_HUE), 0, 360);
}

export function enhancedHueToDegrees(enhancedHue: number): number {
  return clamp(Math.round((enhancedHue * 360) / 65535), 0, 360);
}

export function saturationToMatter(percent: number): number {
  return clamp(
    Math.round((percent * MATTER_MAX_SATURATION) / 100),
    0,
    MATTER_MAX_SATURATION
  );
}

export function matterSaturationToPercent(saturation: number): number {
  return clamp(Math.round((saturation * 100) / MATTER_MAX_SATURATION), 0, 100);
}

export function xyToMatter(value: number): number {
  return clamp(Math.round(value * 65536), 0, MATTER_MAX_XY);
}

export function matterToXy(value: number): number {
  return value / 65536;
}

// sRGB gamma correction
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** D65 white point */
const WHITE = { x: 0.3127, y: 0.329 };

/**
 * Converts a hue (degrees) / saturation (%) at full value to CIE 1931 xy
 * chromaticity coordinates using the sRGB gamut (D65).
 */
export function hueSaturationToXy(
  hue: number,
  saturation: number
): { x: number; y: number } {
  const s = clamp(saturation, 0, 100) / 100;
  const h = (((hue % 360) + 360) % 360) / 60;
  const c = s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = 1 - c;
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.min(5, Math.floor(h))];

  const r = toLinear(r1 + m);
  const g = toLinear(g1 + m);
  const b = toLinear(b1 + m);

  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const sum = X + Y + Z;
  if (sum === 0) return { ...WHITE };
  return { x: X / sum, y: Y / sum };
}

/**
 * Converts CIE 1931 xy chromaticity coordinates to hue (degrees) and
 * saturation (%). Colors outside the sRGB gamut are clipped.
 */
export function xyToHueSaturation(
  x: number,
  y: number
): { hue: number; saturation: number } {
  if (y <= 0) return { hue: 0, saturation: 0 };

  const X = x / y;
  const Z = (1 - x - y) / y;
  const linear = [
    3.2406 * X - 1.5372 - 0.4986 * Z,
    -0.9689 * X + 1.8758 + 0.0415 * Z,
    0.0557 * X - 0.204 + 1.057 * Z,
  ].map((c) => Math.max(0, c));

  const linearMax = Math.max(...linear);
  if (linearMax <= 0) return { hue: 0, saturation: 0 };

  const [r, g, b] = linear.map((c) => clamp(fromLinear(c / linearMax), 0, 1));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;

  return {
    hue: Math.round(hue) % 360,
    saturation: Math.round(max === 0 ? 0 : (delta / max) * 100),
  };
}

/**
 * Builds the electrical measurement clusters from an emeter reading.
 * Matter units are mW, mV, mA and mWh.
 */
export function emeterToClusters(realtime: {
  power?: number;
  voltage?: number;
  current?: number;
  total?: number;
}): MatterClusters {
  const toThousandths = (value: number | undefined) =>
    typeof value === 'number' ? Math.round(value * 1000) : null;

  return {
    electricalPowerMeasurement: {
      activePower: toThousandths(realtime.power),
      ...(realtime.voltage !== undefined
        ? { voltage: toThousandths(realtime.voltage) }
        : {}),
      ...(realtime.current !== undefined
        ? { activeCurrent: toThousandths(realtime.current) }
        : {}),
    },
    ...(realtime.total !== undefined
      ? {
          electricalEnergyMeasurement: {
            cumulativeEnergyImported:
              typeof realtime.total === 'number'
                ? { energy: Math.round(realtime.total * 1_000_000) }
                : null,
          },
        }
      : {}),
  };
}

/** Truncates strings to the 32 characters Matter allows for basic information */
export function truncate32(value: string): string {
  return value.length > 32 ? value.slice(0, 32) : value;
}
