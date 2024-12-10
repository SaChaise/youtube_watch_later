// darkMode.js
class DarkModeManager {
  constructor() {
    this.STORAGE_KEY = "color-theme";
    this.init();
    this.setupListeners();
  }

  init() {
    // Vérifie la préférence système
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    // Vérifie le stockage local
    const storedTheme = localStorage.getItem(this.STORAGE_KEY);

    // Applique le thème
    if (storedTheme) {
      document.documentElement.classList.toggle("dark", storedTheme === "dark");
    } else {
      document.documentElement.classList.toggle("dark", prefersDark);
      localStorage.setItem(this.STORAGE_KEY, prefersDark ? "dark" : "light");
    }
  }

  setupListeners() {
    // Écoute les changements de préférence système
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          document.documentElement.classList.toggle("dark", e.matches);
        }
      });

    // Ajoute le bouton de toggle dans le header
    this.addToggleButton();
  }

  addToggleButton() {
    const button = document.createElement("button");
    button.className = "dark-mode-toggle";
    button.innerHTML = `
            <div class="relative w-12 h-6 transition duration-200 ease-linear rounded-full">
                <div class="absolute w-6 h-6 transition duration-100 ease-linear transform bg-white rounded-full shadow-lg dark-mode-toggle-dot">
                    <i class="absolute inset-0 flex items-center justify-center transition duration-100 ease-linear text-yellow-500 dark:text-gray-400">
                        <svg class="w-4 h-4 sun" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <svg class="hidden w-4 h-4 moon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                    </i>
                </div>
            </div>
        `;

    button.addEventListener("click", () => this.toggle());

    // Insère le bouton dans le header
    const header = document.querySelector("header");
    if (header) {
      header.appendChild(button);
    }

    this.updateButtonState();
  }

  toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem(this.STORAGE_KEY, isDark ? "dark" : "light");
    this.updateButtonState();
    this.dispatchThemeChangeEvent(isDark);
  }

  updateButtonState() {
    const isDark = document.documentElement.classList.contains("dark");
    const button = document.querySelector(".dark-mode-toggle");
    if (button) {
      const sun = button.querySelector(".sun");
      const moon = button.querySelector(".moon");
      if (isDark) {
        sun.classList.add("hidden");
        moon.classList.remove("hidden");
      } else {
        sun.classList.remove("hidden");
        moon.classList.add("hidden");
      }
    }
  }

  dispatchThemeChangeEvent(isDark) {
    window.dispatchEvent(
      new CustomEvent("themeChange", {
        detail: { isDark },
      })
    );
  }
}

// CSS supplémentaire pour le bouton
const style = document.createElement("style");
style.textContent = `
    .dark-mode-toggle {
        position: relative;
        padding: 0.5rem;
        border-radius: 9999px;
        transition: background-color 0.3s;
        cursor: pointer;
    }

    .dark-mode-toggle:hover {
        background-color: var(--color-background-secondary);
    }

    .dark-mode-toggle-dot {
        transition: transform 0.3s var(--transition-bounce);
    }

    .dark .dark-mode-toggle-dot {
        transform: translateX(100%);
    }

    /* Animations des icônes */
    .sun, .moon {
        position: absolute;
        transition: all 0.3s var(--transition-bounce);
    }

    .sun {
        opacity: 1;
        transform: rotate(0);
    }

    .moon {
        opacity: 0;
        transform: rotate(-90deg);
    }

    .dark .sun {
        opacity: 0;
        transform: rotate(90deg);
    }

    .dark .moon {
        opacity: 1;
        transform: rotate(0);
    }
`;

document.head.appendChild(style);

// Initialisation
const darkMode = new DarkModeManager();
export default darkMode;
