/**
 * Colours assigned to albums for the timeline's album rings.
 *
 * The colour is derived from the album id rather than picked at random on each render, so an album
 * keeps the same colour while scrolling, across reloads and between devices. Mid lightness keeps
 * every hue legible against both the light and dark timeline backgrounds.
 */

/** How thick a single album ring is, in pixels. */
export const ALBUM_RING_WIDTH = 4;

/** Rings beyond this are dropped, so an asset in many albums keeps a usable thumbnail. */
export const ALBUM_RING_LIMIT = 3;

const hashAlbumId = (albumId: string) => {
  // FNV-1a: cheap, and spreads similar uuids across the hue circle.
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < albumId.length; index++) {
    hash ^= albumId.codePointAt(index)!;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
};

export const getAlbumColor = (albumId: string) => {
  const hash = hashAlbumId(albumId);
  const hue = hash % 360;
  const saturation = 62 + ((hash >>> 9) % 28);
  const lightness = 46 + ((hash >>> 17) % 14);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
};

/**
 * Ring colours for an asset, outermost first. The album ids arrive sorted from the API, so the
 * nesting order is stable for every asset sharing a given set of albums.
 */
export const getAlbumRingColors = (albumIds: string[] | undefined) =>
  (albumIds ?? []).slice(0, ALBUM_RING_LIMIT).map((albumId) => getAlbumColor(albumId));
