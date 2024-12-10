class ApiService {
  constructor() {
    this.baseUrl = "";
    this.retryCount = 3;
    this.retryDelay = 1000;
  }

  handleQuotaError() {
    const errorModal = document.createElement("div");
    errorModal.className =
      "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    errorModal.innerHTML = `
     <div class="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
       <div class="text-center">
         <i class="fas fa-exclamation-circle text-5xl text-red-500 mb-4"></i>
         <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
           Quota YouTube dépassé
         </h2>
         <p class="text-gray-600 dark:text-gray-400 mb-6">
           Le quota d'API YouTube pour aujourd'hui a été atteint. 
           Les données seront à nouveau disponibles demain.
         </p>
         <div class="flex justify-center space-x-4">
           <button onclick="this.closest('.fixed').remove()" 
                   class="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
             Compris
           </button>
           <a href="https://developers.google.com/youtube/v3/getting-started#quota" 
              target="_blank"
              class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
             En savoir plus
           </a>
         </div>
       </div>
     </div>
   `;
    document.body.appendChild(errorModal);
  }

  async request(endpoint, options = {}) {
    let attempts = 0;

    while (attempts < this.retryCount) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          if (error.error?.toLowerCase().includes("quota")) {
            this.handleQuotaError();
            throw new Error("Quota dépassé");
          }
          throw new Error(error.error || "Erreur réseau");
        }

        const data = await response.json();
        if (data.error?.toLowerCase().includes("quota")) {
          this.handleQuotaError();
          throw new Error("Quota dépassé");
        }
        return data;
      } catch (error) {
        attempts++;
        if (attempts === this.retryCount) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempts)
        );
      }
    }
  }

  async getWatchTime() {
    return await this.request("/get_watch_time");
  }

  // API Endpoints
  async getStatistics() {
    return await this.request("/get_statistics");
  }

  async getDailyStats(days = 7) {
    return await this.request(`/get_daily_stats?days=${days}`);
  }

  async getQuotaStatus() {
    return await this.request("/get_quota_status");
  }

  async updateCheckHours(hours) {
    return await this.request("/update_check_hours", {
      method: "POST",
      body: JSON.stringify({ hours }),
    });
  }

  async getSubscriptions() {
    return await this.request("/get_subscriptions");
  }

  async getWatchLaterVideos() {
    return await this.request("/get_watch_later_videos");
  }

  async addToWatchLater(videoId, title) {
    try {
      const response = await fetch("/add_to_watch_later", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_id: videoId, title: title }),
      });

      const data = await response.json();

      if (!response.ok) {
        // response.ok est false pour le code 400
        if (
          response.status === 400 &&
          data.error &&
          data.error.includes("Short")
        ) {
          window.showToast(data.error, "warning"); // Utiliser warning au lieu de info/error
          return { success: false, isShort: true };
        }
        throw new Error(data.error || "Erreur lors de l'ajout de la vidéo");
      }

      window.showToast("Vidéo ajoutée à Watch Later Pro", "success");
      return { success: true };
    } catch (error) {
      console.error("Erreur lors de l'ajout à Watch Later:", error);
      window.showToast(error.message, "error");
      return { success: false, error: error.message };
    }
  }

  async saveSelectedChannels(channelIds) {
    try {
      const response = await this.request("/save_channels", {
        method: "POST",
        body: JSON.stringify({ channel_ids: channelIds }),
      });

      console.log("Réponse de saveSelectedChannels:", response);

      if (response.success) {
        // Mettre à jour les statistiques immédiatement
        if (window.statisticsManager) {
          window.statisticsManager.updateStats({
            selected_channels: channelIds.length,
            total_channels: response.stats?.total_channels,
            total_videos: response.stats?.total_videos,
            total_watch_time: response.stats?.total_watch_time,
          });
        }

        // Mettre à jour l'interface si nécessaire
        const selectedChannelsElement =
          document.getElementById("selectedChannels");
        if (selectedChannelsElement) {
          selectedChannelsElement.textContent = channelIds.length;
        }
      }

      return response;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des chaînes:", error);
      throw error;
    }
  }

  async removeFromWatchLater(videoId) {
    try {
      const response = await this.request("/remove_from_watch_later", {
        method: "POST",
        body: JSON.stringify({ video_id: videoId }),
      });

      // S'assurer que les statistiques sont mises à jour
      if (response.success && window.statisticsManager) {
        window.statisticsManager.updateStats({
          total_watch_time: response.new_total_time,
          total_videos: response.new_video_count,
          removed_duration: response.removed_duration,
        });

        // Log pour debug
        console.log("Mise à jour après suppression:", {
          new_time: response.new_total_time,
          new_count: response.new_video_count,
          removed: response.removed_duration,
        });
      }

      return response;
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      throw error;
    }
  }

  async checkWatchedVideos() {
    return await this.request("/check_watched_videos");
  }

  async saveChannels(channelIds) {
    return await this.request("/save_channels", {
      method: "POST",
      body: JSON.stringify({ channel_ids: channelIds }),
    });
  }

  async startMonitoring() {
    return await this.request("/start_monitoring");
  }

  async stopMonitoring() {
    return await this.request("/stop_monitoring");
  }

  async getChannelVideos(channelId) {
    return await this.request(`/get_recent_videos/${channelId}`);
  }

  async getMonitoringStatus() {
    return await this.request("/get_monitoring_status");
  }

  async getWatchedStatus(videoId) {
    return await this.request(`/get_watched_status/${videoId}`);
  }

  async refreshChannels() {
    return await this.request("/refresh_channels");
  }

  handleError(error) {
    console.error("Erreur API:", error);

    if (error.message?.toLowerCase().includes("quota")) {
      this.handleQuotaError();
      return;
    }

    const message = error.message || "Une erreur s'est produite";
    if (window.showToast) {
      window.showToast(message, "error");
    } else {
      alert(message);
    }
  }
}

window.apiService = new ApiService();

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error) {
    apiService.handleError(event.reason);
  }
});

window.addEventListener("online", () => {
  window.showToast("Connexion rétablie", "success");
});

window.addEventListener("offline", () => {
  window.showToast("Connexion perdue", "error");
});
