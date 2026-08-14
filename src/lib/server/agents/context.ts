/**
 * The shared view agents reason over.
 *
 * Agents read the
 * same derived regional picture the rest of the platform reads, built from
 * cached upstream snapshots — so an agent's conclusion is reproducible from
 * published data rather than from state this system invented.
 */

import { buildRegionalPicture, type RegionalPicture } from "../projection";
import { fetchAllSources } from "../sources";

/**
 * Current regional picture, from cached snapshots.
 *
 * Cheap to call: the source layer only touches the network when a snapshot
 * has expired.
 */
export async function currentPicture(): Promise<RegionalPicture> {
  return buildRegionalPicture(await fetchAllSources(false));
}

export type { RegionalPicture };
