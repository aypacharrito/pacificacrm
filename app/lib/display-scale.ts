export const displayScaleLimits = {min:80, max:125, step:5, default:90} as const;

/** Keep old saved presets readable while migrating to a continuous size control. */
export function cleanDisplayScale(value:unknown, legacySize?:unknown):number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return legacySize === "extra-large" ? 115 : legacySize === "comfortable" ? 85 : displayScaleLimits.default;
  return Math.min(displayScaleLimits.max, Math.max(displayScaleLimits.min, Math.round(value / displayScaleLimits.step) * displayScaleLimits.step));
}
