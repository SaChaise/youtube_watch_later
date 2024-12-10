class TimeSelector {
  constructor() {
    console.log("Initialisation du TimeSelector");
    this.times = new Set();
    this.init();

    // Écouter les changements de thème
    window.addEventListener("themeChange", (e) => {
      this.updateTheme(e.detail.isDarkMode);
    });
  }

  init() {
    console.log("Démarrage de l'initialisation");
    this.loadSavedTimes();
    this.setupEventListeners();
  }

  setupEventListeners() {
    console.log("Configuration des événements");

    const hoursInput = document.getElementById("hours");
    const minutesInput = document.getElementById("minutes");
    const addButton = document.getElementById("addTimeButton");

    if (!hoursInput || !minutesInput || !addButton) {
      console.error("Elements manquants:", {
        hoursInput: !!hoursInput,
        minutesInput: !!minutesInput,
        addButton: !!addButton,
      });
      return;
    }

    // Validation et formatage des heures
    hoursInput.addEventListener("input", (e) => {
      console.log("Input heures:", e.target.value);
      this.validateHoursInput(hoursInput);
    });

    // Validation et formatage des minutes
    minutesInput.addEventListener("input", (e) => {
      console.log("Input minutes:", e.target.value);
      this.validateMinutesInput(minutesInput);
    });

    // Navigation entre les champs
    hoursInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" && hoursInput.value.length === 2) {
        console.log("Navigation vers minutes");
        minutesInput.focus();
      }
      if (e.key === "Enter") {
        minutesInput.focus();
      }
    });

    minutesInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && minutesInput.selectionStart === 0) {
        console.log("Navigation vers heures");
        hoursInput.focus();
      }
      if (e.key === "Enter") {
        console.log("Touche Entrée pressée");
        this.addTime();
      }
    });

    // Bouton d'ajout
    addButton.addEventListener("click", () => {
      console.log("Clic sur le bouton d'ajout");
      this.addTime();
    });

    console.log("Événements configurés avec succès");
  }

  validateHoursInput(input) {
    let value = input.value.replace(/[^0-9]/g, "");
    value = parseInt(value, 10);

    if (isNaN(value)) value = 0;
    if (value > 23) value = 23;
    if (value < 0) value = 0;

    const formattedValue = value.toString().padStart(2, "0");
    console.log("Validation heures:", value, "→", formattedValue);
    input.value = formattedValue;
  }

  validateMinutesInput(input) {
    let value = input.value.replace(/[^0-9]/g, "");
    value = parseInt(value, 10);

    if (isNaN(value)) value = 0;
    if (value > 59) value = 59;
    if (value < 0) value = 0;

    const formattedValue = value.toString().padStart(2, "0");
    console.log("Validation minutes:", value, "→", formattedValue);
    input.value = formattedValue;
  }

  async loadSavedTimes() {
    console.log("Chargement des horaires sauvegardés");
    try {
      const response = await fetch("/get_monitoring_status");
      const data = await response.json();
      console.log("Données reçues du serveur:", data);

      if (data.success && data.status && data.status.check_times) {
        // Convertir les minutes en format HH:mm
        const formattedTimes = data.status.check_times.map((time) => {
          const hours = Math.floor(time / 60);
          const minutes = time % 60;
          return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}`;
        });
        this.times = new Set(formattedTimes);
        console.log("Horaires chargés:", Array.from(this.times));
        this.updateDisplay();
      }
    } catch (error) {
      console.error("Erreur lors du chargement des horaires:", error);
      showToast("Erreur lors du chargement des horaires", "error");
    }
  }

  addTime() {
    console.log("Tentative d'ajout d'un horaire");

    const hoursInput = document.getElementById("hours");
    const minutesInput = document.getElementById("minutes");

    if (!hoursInput || !minutesInput) {
      console.error("Inputs introuvables");
      return;
    }

    const hours = hoursInput.value.padStart(2, "0");
    const minutes = minutesInput.value.padStart(2, "0");
    const timeString = `${hours}:${minutes}`;

    console.log("Nouvel horaire:", timeString);

    if (this.times.has(timeString)) {
      console.warn("Horaire déjà existant");
      showToast("Cet horaire existe déjà", "warning");
      return;
    }

    // Animation du bouton
    const addButton = document.getElementById("addTimeButton");
    if (addButton) {
      addButton.classList.add("animate-press");
      setTimeout(() => addButton.classList.remove("animate-press"), 200);
    }

    this.times.add(timeString);
    console.log("Horaires après ajout:", Array.from(this.times));

    this.updateDisplay();
    this.saveAndUpdate();

    // Réinitialiser les inputs
    hoursInput.value = "";
    minutesInput.value = "";
    hoursInput.focus();

    showToast("Horaire ajouté avec succès", "success");
  }

  async saveAndUpdate() {
    console.log("Sauvegarde des horaires");
    try {
      // Convertir les horaires au format HH:MM
      const timesList = Array.from(this.times)
        .map((time) => {
          const [hours, minutes] = time.split(":").map(Number);
          return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}`;
        })
        .sort();

      console.log("Horaires à sauvegarder:", timesList);

      const response = await fetch("/update_check_hours", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          times: timesList,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Erreur lors de la sauvegarde");
      }

      this.updateDisplay();
      return data;
    } catch (error) {
      console.error("Erreur de sauvegarde:", error);
      throw error;
    }
  }

  updateDisplay() {
    console.log("Mise à jour de l'affichage");
    const container = document.getElementById("selectedTimes");
    if (!container) {
      console.error("Conteneur selectedTimes introuvable");
      return;
    }

    const timesList = Array.from(this.times).sort();
    console.log("Horaires à afficher:", timesList);

    container.innerHTML = timesList
      .map(
        (time) => `
        <div class="time-tag bg-gray-50 dark:bg-gray-800 rounded-lg p-3 flex items-center justify-between group 
             hover:transform hover:scale-105 transition-all duration-300" data-time="${time}">
          <div class="flex items-center space-x-3">
            <i class="fas fa-clock text-red-500"></i>
            <span class="time-text font-semibold dark:text-white">${time}</span>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 
                  focus:outline-none transition-all duration-300"
                  onclick="window.timeSelector.removeTime('${time}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `
      )
      .join("");
  }

  removeTime(time) {
    console.log("Suppression de l'horaire:", time);

    // Convertir l'heure au format minutes depuis minuit
    const [hours, minutes] = time.split(":").map(Number);
    const timeInMinutes = hours * 60 + minutes;

    // Supprimer l'heure du Set
    this.times.delete(time);

    // Envoyer la mise à jour au serveur
    this.saveAndUpdate()
      .then(() => {
        // Animation de suppression
        const timeTag = document.querySelector(`[data-time="${time}"]`);
        if (timeTag) {
          timeTag.classList.add("fade-out");
          setTimeout(() => {
            this.updateDisplay();
            showToast("Horaire supprimé", "success");
          }, 300);
        }
      })
      .catch((error) => {
        console.error("Erreur lors de la suppression:", error);
        // Restaurer l'horaire en cas d'erreur
        this.times.add(time);
        this.updateDisplay();
        showToast("Erreur lors de la suppression", "error");
      });
  }

  updateTheme(isDarkMode) {
    const container = document.querySelector(".time-selector-container");
    if (container) {
      container.classList.toggle("dark-theme", isDarkMode);
    }

    // Mettre à jour les styles des inputs
    const inputs = document.querySelectorAll(".time-input-wrapper input");
    inputs.forEach((input) => {
      input.classList.toggle("dark-input", isDarkMode);
    });

    // Mettre à jour les tags
    const tags = document.querySelectorAll(".time-tag");
    tags.forEach((tag) => {
      tag.classList.toggle("dark-tag", isDarkMode);
    });
  }
}

// Initialisation
console.log("Création de l'instance TimeSelector");
window.timeSelector = new TimeSelector();
