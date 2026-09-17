import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  cityCoordinates,
  sceneCatalog,
  scenesForLocation,
} from "../shared/locations";
import type { HomeLocation } from "../shared/model";
import { Store } from "./store";
export function inferHome(
  headers: { evidenceId: string; header: string }[],
): HomeLocation {
  const matches = headers.flatMap(({ evidenceId, header }) => {
    // Only the contact header is eligible. Employment and education cities are not home evidence.
    const contact = header
      .split(/\b(relocat(?:ing|ion|e)|open to|willing to)\b/i)[0]
      .split(
        /\b(summary|experience|education|skills|professional profile|objective)\b/i,
      )[0];
    return scenesForLocation(contact)
      .filter((id) => {
        if (id === "remote" || !cityCoordinates[id]) return false;
        const match = sceneCatalog[id].match?.exec(contact);
        if (!match) return false;
        const after = contact.slice(match.index + match[0].length);
        const before = contact.slice(0, match.index);
        return (
          /^\s*,\s*[A-Za-z]{2,}/.test(after) ||
          /(?:location|home|based in)\s*:?\s*$/i.test(before)
        );
      })
      .map((id) => ({ id, evidenceId }));
  });
  const ids = [...new Set(matches.map((m) => m.id))];
  if (ids.length !== 1)
    return {
      status: ids.length ? "conflict" : "unset",
      label: null,
      coordinates: null,
      evidenceIds: matches.map((m) => m.evidenceId),
    };
  return {
    status: "resume",
    label: sceneCatalog[ids[0]].label,
    coordinates: cityCoordinates[ids[0]]!,
    evidenceIds: [...new Set(matches.map((m) => m.evidenceId))],
  };
}
export function homeResolver(store: Store) {
  let generation = -1,
    busy = false,
    stopped = false;
  return {
    stop() {
      stopped = true;
    },
    async refresh() {
      if (stopped || busy) return;
      const snapshot = store.snapshot();
      if (generation === snapshot.generation) return;
      busy = true;
      try {
        const headers: { evidenceId: string; header: string }[] = [];
        let failures = 0;
        for (const a of snapshot.applications)
          for (const evidence of a.evidence) {
            if (evidence.kind !== "resume") continue;
            if (!evidence.file) {
              if (evidence.text)
                headers.push({
                  evidenceId: evidence.id,
                  header: evidence.text.split("\n").slice(0, 5).join("\n"),
                });
              continue;
            }
            try {
              const artifact = store.artifact(evidence.id);
              if (artifact.mediaType !== "application/pdf") continue;
              const task = getDocument({
                data: new Uint8Array(readFileSync(artifact.path)),
                useSystemFonts: true,
              });
              try {
                const doc = await task.promise,
                  page = await doc.getPage(1),
                  content = await page.getTextContent();
                const height = page.view[3];
                const header = content.items
                  .filter(
                    (
                      item,
                    ): item is import("pdfjs-dist/types/src/display/api").TextItem =>
                      "str" in item && item.transform[5] > height * 0.84,
                  )
                  .map((item) => item.str)
                  .join(" ");
                headers.push({ evidenceId: evidence.id, header });
              } finally {
                await task.destroy();
              }
            } catch {
              failures++;
            }
          }
        if (
          stopped ||
          Number(store.meta("generation", "0")) !== snapshot.generation
        )
          return;
        const result = failures
          ? {
              status: "unreadable",
              label: null,
              coordinates: null,
              evidenceIds: [],
            }
          : inferHome(headers);
        store.db
          .prepare(
            "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run("homeLocation", JSON.stringify(result));
        generation = snapshot.generation;
      } finally {
        busy = false;
      }
    },
  };
}
