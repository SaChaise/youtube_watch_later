// themeService.js
class ThemeService {
  constructor() {
    this.STORAGE_KEY = "theme-preference";
    this.DARK_CLASS = "dark";

    // Variables CSS pour le thème sombre
    this.darkThemeVars = {
      "--bg-primary": "#1F2937",
      "--bg-secondary": "#111827",
      "--text-primary": "#F9FAFB",
      "--text-secondary": "#D1D5DB",
      "--border": "#374151",
      "--input-bg": "#374151",
      "--card-bg": "#1F2937",
      "--hover-bg": "#4B5563",
    };

    // Variables CSS pour le thème clair
    this.lightThemeVars = {
      "--bg-primary": "#FFFFFF",
      "--bg-secondary": "#F3F4F6",
      "--text-primary": "#111827",
      "--text-secondary": "#6B7280",
      "--border": "#E5E7EB",
      "--input-bg": "#F9FAFB",
      "--card-bg": "#FFFFFF",
      "--hover-bg": "#F3F4F6",
    };

    this.init();
    this.setupListeners();
  }

  init() {
    // Détecter la préférence système
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const storedPreference = localStorage.getItem(this.STORAGE_KEY);

    this.isDark = storedPreference ? storedPreference === "dark" : prefersDark;

    this.applyTheme();
  }

  setupListeners() {
    // Écouter les changements de préférence système
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.isDark = e.matches;
          this.applyTheme();
        }
      });

    // Écouter les changements de route pour persister le thème
    window.addEventListener("popstate", () => this.applyTheme());
  }

  toggle() {
    this.isDark = !this.isDark;
    localStorage.setItem(this.STORAGE_KEY, this.isDark ? "dark" : "light");
    this.applyTheme();

    // Émettre un événement pour les autres composants
    window.dispatchEvent(
      new CustomEvent("themeChange", {
        detail: { isDark: this.isDark },
      })
    );
  }

  applyTheme() {
    const root = document.documentElement;
    const vars = this.isDark ? this.darkThemeVars : this.lightThemeVars;

    // Appliquer la classe dark
    root.classList.toggle(this.DARK_CLASS, this.isDark);

    // Appliquer les variables CSS
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Mettre à jour la meta tag theme-color
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", this.isDark ? "#1F2937" : "#FFFFFF");

    // Animer la transition
    document.body.style.transition = "background-color 0.3s ease";
  }

  // Méthode utilitaire pour obtenir une couleur basée sur le thème actuel
  getColor(lightColor, darkColor) {
    return this.isDark ? darkColor : lightColor;
  }
}

const themeService = new ThemeService();
export default themeService;
