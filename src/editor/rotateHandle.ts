import type { QuarterTurn } from '../simulation/network/scene';

/** The angle of a board point about a centre, anticlockwise seen from above (x east, z south), radians. */
const angleAbout = ([cx, cz]: [number, number], [x, z]: [number, number]) => Math.atan2(-(z - cz), x - cx);

/**
 * The piece's turn while its rotation handle is dragged from `from` to `to` (board points):
 * the swept angle about the piece, rounded to whole quarter turns (as placement turns), added
 * to where it started. Anticlockwise seen from above is positive, as a piece's `rotation` is.
 */
export function turnedRotation(start: QuarterTurn, centre: [number, number], from: [number, number], to: [number, number]): QuarterTurn {
  let swept = angleAbout(centre, to) - angleAbout(centre, from);
  swept = Math.atan2(Math.sin(swept), Math.cos(swept)); // the short way round, -π to π
  const quarters = Math.round(swept / (Math.PI / 2));
  return ((((start + quarters * 90) % 360) + 360) % 360) as QuarterTurn;
}
