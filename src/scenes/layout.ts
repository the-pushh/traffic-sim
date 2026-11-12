/** Whole tiles from `from` up to (not including) `to`, for laying out runs of road. */
export const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
