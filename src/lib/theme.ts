/** Light, dark, or follow the device. Remembered per device. */
export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "kinfolk-theme";

/** Runs before the page is drawn, so a chosen theme never flashes the other one. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}
export function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Still applies for this visit.
  }
}
