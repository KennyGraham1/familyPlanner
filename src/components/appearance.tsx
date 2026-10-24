"use client";
import { useState } from "react";
import { Moon } from "lucide-react";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme";
import { SectionHeader } from "./ui";

const labels: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  return (
    <section className="card settings-card" aria-label="Appearance">
      <SectionHeader icon={Moon} title="Appearance" />
      <div
        className="segmented-control appearance-choice"
        role="group"
        aria-label="Theme"
      >
        {(Object.keys(labels) as Theme[]).map((option) => (
          <button
            key={option}
            className={theme === option ? "active" : ""}
            aria-pressed={theme === option}
            onClick={() => {
              applyTheme(option);
              setTheme(option);
            }}
          >
            {labels[option]}
          </button>
        ))}
      </div>
      <p className="form-hint">
        System follows your phone or computer. Saved on this device.
      </p>
    </section>
  );
}
