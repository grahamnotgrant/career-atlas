import { z } from "zod";
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
  "washington-dc",
  "philadelphia",
  "houston",
  "phoenix",
  "minneapolis",
  "detroit",
  "portland",
  "salt-lake-city",
  "raleigh",
  "nashville",
  "charlotte",
  "pittsburgh",
  "columbus",
  "kansas-city",
  "st-louis",
  "las-vegas",
  "tampa",
  "san-antonio",
  "baltimore",
  "sacramento",
  "vancouver",
  "montreal",
  "ottawa",
  "calgary",
  "waterloo",
  "berlin",
  "munich",
  "amsterdam",
  "dublin",
  "zurich",
  "stockholm",
  "copenhagen",
  "lisbon",
  "madrid",
  "barcelona",
  "milan",
  "warsaw",
  "tel-aviv",
  "dubai",
  "singapore",
  "tokyo",
  "seoul",
  "hong-kong",
  "bangalore",
  "mumbai",
  "sao-paulo",
  "mexico-city",
  "melbourne",
] as const;
export type SceneId = (typeof sceneIds)[number];
export interface SceneEntry {
  label: string;
  landmark: string;
  tint: string;
  match?: RegExp;
  /** Present for cities added at runtime rather than drawn in the code. */
  custom?: true;
}
export const sceneCatalog: Record<string, SceneEntry> = {
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
  "washington-dc": {
    label: "Washington, DC",
    landmark: "Washington Monument and the Mall",
    tint: "#3c4a5e",
    match:
      /\b(washington,? d\.?c\.?|dc|arlington|mclean|reston|tysons|bethesda|alexandria, va)\b/i,
  },
  philadelphia: {
    label: "Philadelphia",
    landmark: "City Hall tower on Market Street",
    tint: "#4c4358",
    match: /\b(philadelphia|philly)\b/i,
  },
  houston: {
    label: "Houston",
    landmark: "Downtown towers over the bayou",
    tint: "#3e4b5a",
    match: /\bhouston\b/i,
  },
  phoenix: {
    label: "Phoenix",
    landmark: "Camelback Mountain and low towers",
    tint: "#5e4a44",
    match: /\b(phoenix|scottsdale|tempe|mesa, az)\b/i,
  },
  minneapolis: {
    label: "Minneapolis",
    landmark: "Stone Arch Bridge over the Mississippi",
    tint: "#2f4a5d",
    match: /\b(minneapolis|st\.? paul|twin cities)\b/i,
  },
  detroit: {
    label: "Detroit",
    landmark: "Renaissance Center on the river",
    tint: "#3b4756",
    match: /\bdetroit\b/i,
  },
  portland: {
    label: "Portland",
    landmark: "Steel bridges and Mount Hood",
    tint: "#2f4d4f",
    match: /\bportland,? (?:or|oregon)\b|\bportland\b(?! ?,? ?me)/i,
  },
  "salt-lake-city": {
    label: "Salt Lake City",
    landmark: "Wasatch range behind the grid",
    tint: "#4a4d5c",
    match: /\b(salt lake(?: city)?|slc|lehi|provo)\b/i,
  },
  raleigh: {
    label: "Raleigh–Durham",
    landmark: "Oaks and the research triangle",
    tint: "#334f48",
    match: /\b(raleigh|durham|research triangle|rtp|chapel hill)\b/i,
  },
  nashville: {
    label: "Nashville",
    landmark: "Batman building and the river bend",
    tint: "#4f4552",
    match: /\bnashville\b/i,
  },
  charlotte: {
    label: "Charlotte",
    landmark: "Uptown crown towers",
    tint: "#354a5c",
    match: /\bcharlotte\b/i,
  },
  pittsburgh: {
    label: "Pittsburgh",
    landmark: "Three rivers and yellow bridges",
    tint: "#3e4451",
    match: /\bpittsburgh\b/i,
  },
  columbus: {
    label: "Columbus",
    landmark: "Scioto riverfront and the LeVeque tower",
    tint: "#3b4a56",
    match: /\bcolumbus,? (?:oh|ohio)\b|\bcolumbus\b/i,
  },
  "kansas-city": {
    label: "Kansas City",
    landmark: "Fountains and the Liberty Memorial",
    tint: "#45495a",
    match: /\bkansas city\b/i,
  },
  "st-louis": {
    label: "St. Louis",
    landmark: "Gateway Arch over the Mississippi",
    tint: "#3d4a5f",
    match: /\b(st\.? louis|saint louis)\b/i,
  },
  "las-vegas": {
    label: "Las Vegas",
    landmark: "Strip lights and the Stratosphere",
    tint: "#4a3f5e",
    match: /\b(las vegas|henderson, nv)\b/i,
  },
  tampa: {
    label: "Tampa",
    landmark: "Bayshore and the Riverwalk",
    tint: "#2f4f5d",
    match: /\b(tampa|st\.? petersburg, fl|clearwater)\b/i,
  },
  "san-antonio": {
    label: "San Antonio",
    landmark: "River Walk and the Tower of the Americas",
    tint: "#4f4a48",
    match: /\bsan antonio\b/i,
  },
  baltimore: {
    label: "Baltimore",
    landmark: "Inner Harbor and Federal Hill",
    tint: "#3a4759",
    match: /\bbaltimore\b/i,
  },
  sacramento: {
    label: "Sacramento",
    landmark: "Tower Bridge and the Capitol dome",
    tint: "#4a4f47",
    match: /\bsacramento\b/i,
  },
  vancouver: {
    label: "Vancouver",
    landmark: "Harbour, mountains and Canada Place sails",
    tint: "#2c4a58",
    match: /\bvancouver\b(?!,? ?wa)/i,
  },
  montreal: {
    label: "Montreal",
    landmark: "Mount Royal and the old port",
    tint: "#3d4360",
    match: /\b(montr[eé]al)\b/i,
  },
  ottawa: {
    label: "Ottawa",
    landmark: "Parliament Hill on the river",
    tint: "#3f4a52",
    match: /\bottawa\b/i,
  },
  calgary: {
    label: "Calgary",
    landmark: "Calgary Tower against the Rockies",
    tint: "#3a4c5c",
    match: /\bcalgary\b/i,
  },
  waterloo: {
    label: "Waterloo",
    landmark: "Tech corridor and the Grand River",
    tint: "#374d55",
    match: /\b(waterloo|kitchener)\b/i,
  },
  berlin: {
    label: "Berlin",
    landmark: "Fernsehturm above the Spree",
    tint: "#3b4550",
    match: /\bberlin\b/i,
  },
  munich: {
    label: "Munich",
    landmark: "Frauenkirche towers and the Alps",
    tint: "#3e4a5a",
    match: /\b(munich|m[uü]nchen)\b/i,
  },
  amsterdam: {
    label: "Amsterdam",
    landmark: "Canal houses and bridges",
    tint: "#3a4a5e",
    match: /\bamsterdam\b/i,
  },
  dublin: {
    label: "Dublin",
    landmark: "Ha'penny Bridge over the Liffey",
    tint: "#2f4d4a",
    match: /\bdublin\b(?!,? ?(?:ca|oh))/i,
  },
  zurich: {
    label: "Zurich",
    landmark: "Lake and the Grossmünster towers",
    tint: "#334a5e",
    match: /\b(zurich|z[uü]rich)\b/i,
  },
  stockholm: {
    label: "Stockholm",
    landmark: "Gamla stan across the water",
    tint: "#354b5c",
    match: /\bstockholm\b/i,
  },
  copenhagen: {
    label: "Copenhagen",
    landmark: "Nyhavn and the harbour spires",
    tint: "#3a4c58",
    match: /\b(copenhagen|k[oø]benhavn)\b/i,
  },
  lisbon: {
    label: "Lisbon",
    landmark: "Hills, trams and the 25 de Abril bridge",
    tint: "#4f4a4c",
    match: /\b(lisbon|lisboa)\b/i,
  },
  madrid: {
    label: "Madrid",
    landmark: "Gran Vía and the four towers",
    tint: "#4f4548",
    match: /\bmadrid\b/i,
  },
  barcelona: {
    label: "Barcelona",
    landmark: "Sagrada Família and the sea",
    tint: "#4b4a4f",
    match: /\bbarcelona\b/i,
  },
  milan: {
    label: "Milan",
    landmark: "Duomo spires and the new towers",
    tint: "#464852",
    match: /\b(milan|milano)\b/i,
  },
  warsaw: {
    label: "Warsaw",
    landmark: "Palace of Culture and the Vistula",
    tint: "#3c4655",
    match: /\b(warsaw|warszawa)\b/i,
  },
  "tel-aviv": {
    label: "Tel Aviv",
    landmark: "Beachfront towers",
    tint: "#4a4c58",
    match: /\btel aviv\b/i,
  },
  dubai: {
    label: "Dubai",
    landmark: "Burj Khalifa on the gulf",
    tint: "#4f4842",
    match: /\bdubai\b/i,
  },
  singapore: {
    label: "Singapore",
    landmark: "Marina Bay Sands over the bay",
    tint: "#2f4a58",
    match: /\bsingapore\b/i,
  },
  tokyo: {
    label: "Tokyo",
    landmark: "Tokyo Tower and Skytree",
    tint: "#453f5a",
    match: /\btokyo\b/i,
  },
  seoul: {
    label: "Seoul",
    landmark: "Namsan tower over the Han",
    tint: "#3d4658",
    match: /\bseoul\b/i,
  },
  "hong-kong": {
    label: "Hong Kong",
    landmark: "Victoria Harbour skyline",
    tint: "#3b4658",
    match: /\bhong kong\b/i,
  },
  bangalore: {
    label: "Bengaluru",
    landmark: "Vidhana Soudha and tech parks",
    tint: "#4a4d48",
    match: /\b(bangalore|bengaluru)\b/i,
  },
  mumbai: {
    label: "Mumbai",
    landmark: "Marine Drive and the Gateway",
    tint: "#4b4652",
    match: /\b(mumbai|bombay)\b/i,
  },
  "sao-paulo": {
    label: "São Paulo",
    landmark: "Avenida Paulista towers",
    tint: "#3f4652",
    match: /\b(s[aã]o paulo)\b/i,
  },
  "mexico-city": {
    label: "Mexico City",
    landmark: "Ángel de la Independencia on Reforma",
    tint: "#4b4a4a",
    match: /\b(mexico city|ciudad de m[eé]xico|cdmx)\b/i,
  },
  melbourne: {
    label: "Melbourne",
    landmark: "Flinders Street station and the Yarra",
    tint: "#3a4a5c",
    match: /\bmelbourne\b/i,
  },
};
/** A city a user or agent adds when the catalog lacks it. Aliases are plain
    words matched whole and case-insensitively; coordinates place the marker.
    It draws with the generic scene until someone illustrates it. */
export const customCitySchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,40}$/)
    .refine((v) => !(sceneIds as readonly string[]).includes(v), "Built-in id"),
  label: z.string().min(1).max(60),
  aliases: z.array(z.string().min(2).max(60)).min(1).max(20),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  tint: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#3a4656"),
  landmark: z.string().max(120).default(""),
  addedBy: z.enum(["user", "agent"]).default("agent"),
  addedAt: z.iso.datetime(),
});
export type CustomCity = z.infer<typeof customCitySchema>;
const registered = new Map<string, CustomCity>();
const escape = (v: string) => v.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Replace the runtime cities with this list; the server does it on every
    snapshot and the client on every snapshot it receives, before rendering. */
export function registerCities(cities: CustomCity[]) {
  for (const id of registered.keys()) {
    delete sceneCatalog[id];
    delete cityCoordinates[id];
  }
  registered.clear();
  for (const city of cities) {
    registered.set(city.id, city);
    sceneCatalog[city.id] = {
      label: city.label,
      landmark: city.landmark || `${city.label} skyline`,
      tint: city.tint,
      match: new RegExp(`\\b(${city.aliases.map(escape).join("|")})\\b`, "i"),
      custom: true,
    };
    cityCoordinates[city.id] = [city.lon, city.lat];
  }
}
export function allSceneIds(): string[] {
  return [...sceneIds, ...registered.keys()];
}
export function isScene(id: string) {
  return (sceneIds as readonly string[]).includes(id) || registered.has(id);
}
export function scenesForLocation(location: string): string[] {
  return allSceneIds().filter((id) => sceneCatalog[id].match?.test(location));
}
export function applicationScene(a: {
  location: string;
  theme: string;
}): string {
  const matches = scenesForLocation(a.location);
  // A remote role can mention an office; Remote stays the primary scene.
  return matches[0] ?? a.theme;
}
export function availableScenes(
  applications: { location: string; theme: string }[],
): string[] {
  const present = new Set<string>();
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
export const cityCoordinates: Record<string, [number, number] | undefined> = {
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
  "washington-dc": [-77.037, 38.907],
  philadelphia: [-75.165, 39.953],
  houston: [-95.369, 29.76],
  phoenix: [-112.074, 33.448],
  minneapolis: [-93.265, 44.978],
  detroit: [-83.046, 42.331],
  portland: [-122.676, 45.523],
  "salt-lake-city": [-111.891, 40.761],
  raleigh: [-78.638, 35.779],
  nashville: [-86.781, 36.163],
  charlotte: [-80.843, 35.227],
  pittsburgh: [-79.996, 40.441],
  columbus: [-82.999, 39.961],
  "kansas-city": [-94.579, 39.1],
  "st-louis": [-90.199, 38.627],
  "las-vegas": [-115.14, 36.17],
  tampa: [-82.457, 27.951],
  "san-antonio": [-98.494, 29.425],
  baltimore: [-76.612, 39.29],
  sacramento: [-121.494, 38.582],
  vancouver: [-123.121, 49.283],
  montreal: [-73.568, 45.502],
  ottawa: [-75.698, 45.421],
  calgary: [-114.071, 51.045],
  waterloo: [-80.516, 43.464],
  berlin: [13.405, 52.52],
  munich: [11.582, 48.135],
  amsterdam: [4.904, 52.368],
  dublin: [-6.26, 53.35],
  zurich: [8.541, 47.377],
  stockholm: [18.069, 59.329],
  copenhagen: [12.568, 55.676],
  lisbon: [-9.139, 38.722],
  madrid: [-3.704, 40.417],
  barcelona: [2.17, 41.387],
  milan: [9.19, 45.464],
  warsaw: [21.012, 52.23],
  "tel-aviv": [34.782, 32.085],
  dubai: [55.271, 25.205],
  singapore: [103.82, 1.352],
  tokyo: [139.692, 35.69],
  seoul: [126.978, 37.567],
  "hong-kong": [114.169, 22.319],
  bangalore: [77.594, 12.972],
  mumbai: [72.878, 19.076],
  "sao-paulo": [-46.633, -23.551],
  "mexico-city": [-99.133, 19.433],
  melbourne: [144.963, -37.814],
};

export function geographicGroups<
  T extends { id: string; location: string; theme: string },
>(apps: T[]) {
  const groups = new Map<string, string[]>();
  for (const a of apps) {
    const matches = scenesForLocation(a.location);
    const places = matches.includes("remote")
      ? ["remote" as const]
      : matches.length
        ? matches
        : [a.theme];
    for (const place of places) {
      if (place === "neutral") continue;
      const group = groups.get(place) ?? [];
      group.push(a.id);
      groups.set(place, group);
    }
  }
  return [...groups].map(([id, ids]) => ({
    id,
    label: sceneCatalog[id].label,
    ids,
    coordinates: cityCoordinates[id],
  }));
}
