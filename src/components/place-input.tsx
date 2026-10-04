"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import {
  directionsUrl,
  mapEmbedUrl,
  searchPlaces,
  type Coordinates,
  type PlaceSuggestion,
} from "@/lib/places";

/**
 * The event's "Where?" field: plain text, with place suggestions while typing.
 * Picking a suggestion also stores its map position and shows a small map.
 */
export function PlaceInput({
  id,
  value,
  place,
  near,
  onChange,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  place?: Coordinates;
  near?: Coordinates;
  onChange: (text: string, place?: Coordinates) => void;
  "aria-describedby"?: string;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  // Only search for what was typed, not for a suggestion that was just picked.
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(text, near, controller.signal)
        .then((found) => {
          setSuggestions(found);
          setActive(-1);
          setOpen(found.length > 0);
        })
        // Search is optional: without it the field still takes any text.
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, near]);

  function choose(suggestion: PlaceSuggestion) {
    onChange(suggestion.label, suggestion.place);
    setQuery("");
    setOpen(false);
    setSuggestions([]);
  }
  function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      // Close the list without closing the dialog around it.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div
      className="place-input"
      ref={wrapper}
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        id={id}
        name="location"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder="Search for a place or type an address"
        value={value}
        maxLength={200}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          if (e.target.value.trim().length < 3) setOpen(false);
        }}
        onKeyDown={keyDown}
        onFocus={() => suggestions.length > 0 && query && setOpen(true)}
      />
      {open && (
        <ul className="place-suggestions" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              // Keep focus in the input so the choice isn't lost to a blur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
            >
              <MapPin size={15} />
              <span>
                <strong>{s.name}</strong>
                {s.detail && <small>{s.detail}</small>}
              </span>
            </li>
          ))}
          <li className="place-credit" aria-hidden="true">
            Search by Photon · © OpenStreetMap
          </li>
        </ul>
      )}
      {place && (
        <iframe
          className="place-map"
          title={`Map of ${value}`}
          src={mapEmbedUrl(place)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      {value.trim() && (
        <a
          className="text-button place-directions"
          href={directionsUrl(value, place)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation size={13} /> Open in Maps
        </a>
      )}
    </div>
  );
}
