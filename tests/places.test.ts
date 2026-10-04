import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  directionsUrl,
  mapEmbedUrl,
  searchPlaces,
  toSuggestion,
} from "../src/lib/places";

// Shaped like real Photon results.
const park = {
  geometry: { coordinates: [-73.9686596, 40.8068797] as [number, number] },
  properties: {
    osm_type: "W",
    osm_id: "178575123",
    name: "Riverside Park",
    district: "Manhattan",
    city: "New York",
    state: "New York",
    country: "United States",
  },
};
const house = {
  geometry: { coordinates: [174.7633, -36.8485] as [number, number] },
  properties: {
    street: "Queen Street",
    housenumber: "12",
    city: "Auckland",
    country: "New Zealand",
  },
};

describe("place suggestions", () => {
  it("names places and adds where they are", () => {
    assert.deepEqual(toSuggestion(park), {
      id: "W178575123",
      label: "Riverside Park, Manhattan, New York",
      name: "Riverside Park",
      detail: "Manhattan, New York, United States",
      place: { lat: 40.8068797, lon: -73.9686596 },
    });
  });
  it("uses the street address when a place has no name", () => {
    assert.equal(
      toSuggestion(house)?.label,
      "Queen Street 12, Auckland, New Zealand",
    );
  });
  it("asks for nearby places first and drops duplicates", async () => {
    const original = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (url: string) => {
      requested = url;
      return new Response(JSON.stringify({ features: [park, park, house] }));
    }) as typeof fetch;
    try {
      const found = await searchPlaces(
        "Riverside",
        { lat: -36.85, lon: 174.76 },
        new AbortController().signal,
      );
      assert.equal(found.length, 2);
      const params = new URL(requested).searchParams;
      assert.equal(params.get("q"), "Riverside");
      assert.equal(params.get("lat"), "-36.85");
      assert.equal(params.get("lon"), "174.76");
    } finally {
      globalThis.fetch = original;
    }
  });
  it("links to directions and a map", () => {
    assert.equal(
      directionsUrl("Oakwood Primary"),
      "https://www.google.com/maps/dir/?api=1&destination=Oakwood%20Primary",
    );
    assert.equal(
      directionsUrl("Park", { lat: 1.5, lon: 2.25 }),
      "https://www.google.com/maps/dir/?api=1&destination=1.5%2C2.25",
    );
    assert.match(
      mapEmbedUrl({ lat: 1.5, lon: 2.25 }),
      /marker=1\.50000,2\.25000$/,
    );
  });
});
