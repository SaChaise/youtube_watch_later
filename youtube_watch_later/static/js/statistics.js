class StatisticsManager {
  constructor() {
    this.stats = {
      totalVideos: 0,
      totalWatchTime: 0,
      addedToday: 0,
      quotaUsed: 0,
      quotaLimit: 10000,
      lastUpdate: null,
    };
    this.initializeStats();
    this.setupAutomaticUpdates();
  }

  async initializeStats() {
    try {
      const response = await fetch("/get_statistics");
      const data = await response.json();
      if (data.success) {
        this.updateStats(data.statistics);
      }
    } catch (error) {
      console.error("Erreur initialisation stats:", error);
    }
  }

  updateStats(newStats) {
    // Log de débogage initial
    console.log("Mise à jour des stats:", newStats);

    // Mise à jour du temps de visionnage
    if (
      newStats.total_watch_time !== undefined ||
      newStats.watch_time !== undefined ||
      newStats.new_total_time !== undefined
    ) {
      const oldTime = this.stats.totalWatchTime || 0;
      const newTime = parseFloat(
        newStats.total_watch_time ||
          newStats.watch_time ||
          newStats.new_total_time
      );

      this.stats.totalWatchTime = newTime;

      const timeElement = document.getElementById("totalWatchTime");
      if (timeElement) {
        // Animation si le temps diminue
        if (newTime !== oldTime) {
          const animation =
            newTime < oldTime ? "decrease-animation" : "increase-animation";
          timeElement.classList.add(animation);
          setTimeout(() => {
            timeElement.classList.remove(animation);
          }, 500);
        }
        timeElement.textContent = `${newTime.toFixed(2)}min`;
      }
    }

    // Mise à jour du nombre de vidéos
    if (
      newStats.total_videos !== undefined ||
      newStats.video_count !== undefined ||
      newStats.new_video_count !== undefined
    ) {
      const oldCount = this.stats.totalVideos || 0;
      const newCount = parseInt(
        newStats.total_videos ||
          newStats.video_count ||
          newStats.new_video_count
      );

      this.stats.totalVideos = newCount;

      const videosElement = document.getElementById("totalVideos");
      if (videosElement) {
        videosElement.textContent = newCount;

        if (newCount !== oldCount) {
          const animation =
            newCount < oldCount ? "decrease-animation" : "increase-animation";
          videosElement.classList.add(animation);
          setTimeout(() => {
            videosElement.classList.remove(animation);
          }, 500);
        }
      }
    }

    // Mise à jour du nombre total de chaînes
    if (newStats.total_channels !== undefined) {
      const oldTotalChannels = this.stats.totalChannels || 0;
      const newTotalChannels = parseInt(newStats.total_channels);

      this.stats.totalChannels = newTotalChannels;

      const totalChannelsElement = document.getElementById("totalChannels");
      if (totalChannelsElement) {
        totalChannelsElement.textContent = newTotalChannels;

        if (newTotalChannels !== oldTotalChannels) {
          totalChannelsElement.classList.add("update-animation");
          setTimeout(() => {
            totalChannelsElement.classList.remove("update-animation");
          }, 500);
        }
      }
    }

    // Mise à jour du nombre de chaînes sélectionnées
    if (newStats.selected_channels !== undefined) {
      const oldSelectedChannels = this.stats.selectedChannels || 0;
      const newSelectedChannels = parseInt(newStats.selected_channels);

      this.stats.selectedChannels = newSelectedChannels;

      const selectedChannelsElement =
        document.getElementById("selectedChannels");
      if (selectedChannelsElement) {
        selectedChannelsElement.textContent = newSelectedChannels;

        if (newSelectedChannels !== oldSelectedChannels) {
          selectedChannelsElement.classList.add("update-animation");
          setTimeout(() => {
            selectedChannelsElement.classList.remove("update-animation");
          }, 500);
        }
      }
    }

    // Mise à jour de l'horodatage
    this.stats.lastUpdate = new Date();
    const lastUpdateElement = document.getElementById("lastUpdate");
    if (lastUpdateElement) {
      lastUpdateElement.textContent = new Date().toLocaleString("fr-FR");
    }

    // Sauvegarde des stats
    this.save();

    // Log final pour débogage
    console.log("Stats après mise à jour:", {
      totalWatchTime: this.stats.totalWatchTime,
      totalVideos: this.stats.totalVideos,
      totalChannels: this.stats.totalChannels,
      selectedChannels: this.stats.selectedChannels,
    });
  }

  formatWatchTime(minutes) {
    if (!minutes) return "0.00min";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      // Formater avec exactement 2 décimales
      return `${remainingMinutes.toFixed(2)}min`;
    }
    // Pour les heures, garder 2 décimales pour les minutes
    return `${hours}h ${remainingMinutes.toFixed(2)}min`;
  }

  updateDisplay() {
    const elements = {
      totalVideos: document.getElementById("totalVideos"),
      totalWatchTime: document.getElementById("totalWatchTime"),
      apiQuota: document.getElementById("apiQuota"),
      lastUpdate: document.getElementById("lastUpdate"),
    };

    if (elements.totalWatchTime) {
      const formattedTime = this.formatWatchTime(this.stats.totalWatchTime);
      elements.totalWatchTime.textContent = formattedTime;

      // Ajouter une animation lors de la mise à jour
      elements.totalWatchTime.classList.add("update-animation");
      setTimeout(() => {
        elements.totalWatchTime.classList.remove("update-animation");
      }, 500);
    }

    if (elements.apiQuota) {
      const quotaPercentage =
        ((this.stats.quotaLimit - this.stats.quotaUsed) /
          this.stats.quotaLimit) *
        100;
      elements.apiQuota.textContent = `${Math.round(quotaPercentage)}%`;

      elements.apiQuota.classList.remove(
        "text-red-600",
        "text-yellow-600",
        "text-green-600"
      );
      if (quotaPercentage < 10) {
        elements.apiQuota.classList.add("text-red-600");
      } else if (quotaPercentage < 30) {
        elements.apiQuota.classList.add("text-yellow-600");
      } else {
        elements.apiQuota.classList.add("text-green-600");
      }
    }

    if (elements.lastUpdate && this.stats.lastUpdate) {
      elements.lastUpdate.textContent = new Date(
        this.stats.lastUpdate
      ).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "medium",
      });
    }
  }

  async refreshWatchTime() {
    try {
      const response = await apiService.getWatchTime();
      if (response.success) {
        this.stats.totalWatchTime = response.total_watch_time;
        this.updateDisplay();
      }
    } catch (error) {
      console.error(
        "Erreur lors de la mise à jour du temps de visionnage:",
        error
      );
    }
  }

  addVideo(videoData) {
    const duration = this.parseDuration(videoData.duration);
    this.stats.totalVideos++;
    this.stats.addedToday++;
    this.stats.totalWatchTime += duration;
    this.updateDisplay();
    this.save();
  }

  updateQuota(used, limit) {
    this.stats.quotaUsed = used;
    this.stats.quotaLimit = limit;
    this.updateDisplay();
    this.save();
  }

  updateWatchTimeDisplay(newTime) {
    const watchTimeElement = document.getElementById("totalWatchTime");
    const updateIndicator = document.getElementById("watchTimeUpdate");

    if (watchTimeElement) {
      // Sauvegarder l'ancienne valeur pour l'animation
      const oldTime = this.currentTime;
      this.currentTime = newTime;

      // Formater et afficher le nouveau temps
      const formattedTime = this.formatWatchTime(newTime);
      watchTimeElement.textContent = formattedTime;

      // Animation si le temps a changé
      if (newTime !== oldTime) {
        // Animation de l'indicateur
        if (updateIndicator) {
          updateIndicator.classList.remove("hidden");
          setTimeout(() => {
            updateIndicator.classList.add("hidden");
          }, 1000);
        }

        // Animation du texte
        watchTimeElement.classList.remove("animate-update");
        void watchTimeElement.offsetWidth; // Force reflow
        watchTimeElement.classList.add("animate-update");
      }
    }
  }

  async updateWatchTime() {
    try {
      const response = await fetch("/get_watch_time");
      const data = await response.json();

      if (data.success) {
        // Mise à jour de l'affichage avec deux décimales
        const watchTime = parseFloat(data.watch_time).toFixed(2);
        const element = document.getElementById("totalWatchTime");
        if (element) {
          element.textContent = `${watchTime}min`;

          // Animation si la valeur a changé
          if (this.stats.totalWatchTime !== parseFloat(watchTime)) {
            element.classList.add("update-animation");
            setTimeout(() => {
              element.classList.remove("update-animation");
            }, 500);
          }

          this.stats.totalWatchTime = parseFloat(watchTime);
        }
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour du temps:", error);
    }
  }

  setupAutomaticUpdates() {
    // Mise à jour toutes les 5 secondes
    setInterval(() => {
      this.updateWatchTime();
    }, 5000);

    // Mise à jour immédiate
    this.updateWatchTime();
  }

  parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [_, hours = 0, minutes = 0, seconds = 0] = match.map(
      (v) => parseInt(v) || 0
    );
    return hours * 60 + minutes + Math.ceil(seconds / 60);
  }

  save() {
    localStorage.setItem("statisticsData", JSON.stringify(this.stats));
  }

  resetDailyStats() {
    const now = new Date();
    if (now.getHours() === 0) {
      this.stats.addedToday = 0;
      this.stats.quotaUsed = 0;
      this.save();
    }
    this.updateDisplay();
  }
}

window.statisticsManager = new StatisticsManager();
