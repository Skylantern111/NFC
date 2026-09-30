import { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext(undefined);

// Light-only after the brutalist redesign. The provider is kept (with its
// original API surface) so every `useTheme()` call site and the `switchable`
// prop keep working — but there is no dark theme and no toggle anymore.
const PAPER = "#FDFBF7";

export function ThemeProvider({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", PAPER);
    try {
      // Clear any stale stored preference from the old dual-theme system.
      localStorage.removeItem("theme");
    } catch {
      /* ignore */
    }
  }, []);

  // toggleTheme is intentionally undefined so UI that offered a switch hides it.
  return (
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: undefined, switchable: false }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
