/** Local scene catalog. Add a catalog entry and matching Scene artwork together. */
export const sceneIds = [
  "neutral",
  "remote",
  "nyc",
  "la",
  "san-diego",
  "chicago",
  "miami",
  "seattle",
  "dallas",
  "denver",
  "sf",
  "austin",
  "boston",
  "atlanta",
  "london",
  "toronto",
  "paris",
  "sydney",
] as const;
export type SceneId = (typeof sceneIds)[number];
export const sceneCatalog: Record<
  SceneId,
  { label: string; landmark: string; tint: string; match?: RegExp }
> = {
  neutral: {
    label: "Overview",
    landmark: "Earth with shaded continents",
    tint: "#284365",
  },
  remote: {
    label: "Remote",
    landmark: "Earth with shaded continents",
    tint: "#284b5c",
    match: /\b(remote|work from (?:home|anywhere)|distributed)\b/i,
  },
  nyc: {
    label: "New York",
    landmark: "Empire State Building and Manhattan skyline",
    tint: "#47375d",
    match: /\b(new york(?: city)?|nyc|manhattan|brooklyn)\b/i,
  },
  la: {
    label: "Los Angeles",
    landmark: "Griffith Observatory, hills and palms",
    tint: "#614c50",
    match: /\b(los angeles|la|santa monica|culver city|burbank)\b/i,
  },
  "san-diego": {
    label: "San Diego",
    landmark: "Coronado Bridge across the bay",
    tint: "#285363",
    match: /\b(san diego|la jolla)\b/i,
  },
  chicago: {
    label: "Chicago",
    landmark: "Willis Tower and Lake Michigan",
    tint: "#294c63",
    match: /\bchicago\b/i,
  },
  miami: {
    label: "Miami",
    landmark: "Art Deco waterfront and palms",
    tint: "#613e61",
    match: /\bmiami(?: beach)?\b/i,
  },
  seattle: {
    label: "Seattle",
    landmark: "Space Needle, Mount Rainier and Puget Sound",
    tint: "#28594f",
    match: /\b(seattle|bellevue|redmond)\b/i,
  },
  dallas: {
    label: "Dallas",
    landmark: "Reunion Tower and angular downtown skyline",
    tint: "#424a66",
    match: /\b(dallas|dfw|plano|irving|fort worth)\b/i,
  },
  denver: {
    label: "Denver",
    landmark: "Rocky Mountain peaks and downtown",
    tint: "#354d58",
    match: /\b(denver|boulder)\b/i,
  },
  sf: {
    label: "San Francisco",
    landmark: "Golden Gate Bridge and coastal hills",
    tint: "#5d463d",
    match:
      /\b(san francisco|sf|bay area|san mateo|palo alto|mountain view|san jose)\b/i,
  },
  austin: {
    label: "Austin",
    landmark: "Frost Bank Tower and Lady Bird Lake",
    tint: "#405442",
    match: /\baustin\b/i,
  },
  boston: {
    label: "Boston",
    landmark: "Zakim Bridge and harbor",
    tint: "#3e4b64",
    match: /\bboston\b|\bcambridge,?\s+(ma|massachusetts)\b/i,
  },
  atlanta: {
    label: "Atlanta",
    landmark: "Pencil-topped Bank of America Plaza and wooded hills",
    tint: "#3b534d",
    match: /\batlanta\b/i,
  },
  london: {
    label: "London",
    landmark: "Elizabeth Tower and the Thames",
    tint: "#4b4663",
    match: /\blondon\b/i,
  },
  toronto: {
    label: "Toronto",
    landmark: "CN Tower and Lake Ontario",
    tint: "#3d5068",
    match: /\btoronto\b/i,
  },
  paris: {
    label: "Paris",
    landmark: "Eiffel Tower and the Seine",
    tint: "#58495f",
    match: /\bparis\b/i,
  },
  sydney: {
    label: "Sydney",
    landmark: "Opera House sails and harbor",
    tint: "#285664",
    match: /\bsydney\b/i,
  },
};
export function scenesForLocation(location: string): SceneId[] {
  return sceneIds.filter((id) => sceneCatalog[id].match?.test(location));
}
export function applicationScene(a: {
  location: string;
  theme: SceneId;
}): SceneId {
  const matches = scenesForLocation(a.location);
  // A remote role can mention an office; Remote stays the primary scene.
  return matches[0] ?? a.theme;
}
export function availableScenes(
  applications: { location: string; theme: SceneId }[],
): SceneId[] {
  const present = new Set<SceneId>();
  for (const a of applications) {
    const matches = scenesForLocation(a.location);
    for (const id of matches.length ? matches : [a.theme])
      if (id !== "neutral") present.add(id);
  }
  return [...present].sort((a, b) =>
    a === "remote"
      ? -1
      : b === "remote"
        ? 1
        : sceneCatalog[a].label.localeCompare(sceneCatalog[b].label),
  );
}

/** Longitude, latitude for the illustrative globe camera; never geolocates the user. */
export const cityCoordinates: Partial<Record<SceneId, [number, number]>> = {
  nyc: [-74.006, 40.713],
  la: [-118.244, 34.052],
  "san-diego": [-117.161, 32.716],
  chicago: [-87.63, 41.878],
  miami: [-80.192, 25.762],
  seattle: [-122.332, 47.606],
  dallas: [-96.797, 32.777],
  denver: [-104.99, 39.739],
  sf: [-122.419, 37.775],
  austin: [-97.743, 30.267],
  boston: [-71.059, 42.36],
  atlanta: [-84.388, 33.749],
  london: [-0.128, 51.507],
  toronto: [-79.383, 43.653],
  paris: [2.352, 48.857],
  sydney: [151.209, -33.869],
};

export function geographicGroups<
  T extends { id: string; location: string; theme: SceneId },
>(apps: T[]) {
  const groups = new Map<SceneId, string[]>();
  for (const a of apps) {
    const matches = scenesForLocation(a.location);
    const places = matches.includes("remote")
      ? ["remote" as const]
      : matches.length
        ? matches
        : [a.theme];
    for (const place of places) {
      if (place === "neutral") continue;
      groups.set(place, [...(groups.get(place) ?? []), a.id]);
    }
  }
  return [...groups].map(([id, ids]) => ({
    id,
    label: sceneCatalog[id].label,
    ids,
    coordinates: cityCoordinates[id],
  }));
}
