class ChartsManager {
  constructor() {
    this.charts = {};
    this.darkModeColors = {
      background: "#1F2937",
      text: "#F3F4F6",
      grid: "#374151",
      line: "#EF4444",
    };
    this.lightModeColors = {
      background: "#FFFFFF",
      text: "#1F2937",
      grid: "#E5E7EB",
      line: "#EF4444",
    };

    // Écouter les changements de thème
    window.addEventListener("themeChange", (e) => {
      this.updateChartsTheme(e.detail.isDarkMode);
    });
  }

  initDashboardCharts() {
    this.createWatchTimeChart();
    this.createVideoAddedChart();
    this.createQuotaChart();
    this.createChannelActivityChart();
  }

  async createWatchTimeChart() {
    try {
      const response = await fetch("/get_daily_stats?days=7");
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      const ctx = document.getElementById("watchTimeChart").getContext("2d");
      this.charts.watchTime = new Chart(ctx, {
        type: "line",
        data: {
          labels: data.daily_stats.map((stat) =>
            new Date(stat.date).toLocaleDateString("fr-FR", {
              weekday: "short",
            })
          ),
          datasets: [
            {
              label: "Temps de visionnage (minutes)",
              data: data.daily_stats.map((stat) => stat.watch_time),
              borderColor: this.lightModeColors.line,
              tension: 0.4,
              fill: true,
              backgroundColor: "rgba(239, 68, 68, 0.1)",
            },
          ],
        },
        options: this.getChartOptions("Temps de visionnage quotidien"),
      });
    } catch (error) {
      console.error(
        "Erreur lors de la création du graphique de temps de visionnage:",
        error
      );
    }
  }

  async createVideoAddedChart() {
    try {
      const response = await fetch("/get_daily_stats?days=30");
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      const ctx = document.getElementById("videosAddedChart").getContext("2d");
      this.charts.videosAdded = new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.daily_stats.map((stat) =>
            new Date(stat.date).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })
          ),
          datasets: [
            {
              label: "Vidéos ajoutées",
              data: data.daily_stats.map((stat) => stat.videos),
              backgroundColor: this.lightModeColors.line,
              borderRadius: 4,
            },
          ],
        },
        options: this.getChartOptions("Vidéos ajoutées par jour"),
      });
    } catch (error) {
      console.error(
        "Erreur lors de la création du graphique des vidéos ajoutées:",
        error
      );
    }
  }

  createQuotaChart() {
    const ctx = document.getElementById("quotaChart").getContext("2d");
    this.charts.quota = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Utilisé", "Restant"],
        datasets: [
          {
            data: [0, 100],
            backgroundColor: [this.lightModeColors.line, "#E5E7EB"],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
          },
          title: {
            display: true,
            text: "Quota API YouTube",
          },
        },
        cutout: "70%",
      },
    });
  }

  async createChannelActivityChart() {
    try {
      const response = await fetch("/get_channel_activity");
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      const ctx = document
        .getElementById("channelActivityChart")
        .getContext("2d");
      this.charts.channelActivity = new Chart(ctx, {
        type: "radar",
        data: {
          labels: data.channels.map((channel) => channel.title),
          datasets: [
            {
              label: "Vidéos par chaîne",
              data: data.channels.map((channel) => channel.video_count),
              borderColor: this.lightModeColors.line,
              backgroundColor: "rgba(239, 68, 68, 0.2)",
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            r: {
              beginAtZero: true,
              grid: {
                color: this.lightModeColors.grid,
              },
            },
          },
        },
      });
    } catch (error) {
      console.error(
        "Erreur lors de la création du graphique d'activité des chaînes:",
        error
      );
    }
  }

  getChartOptions(title) {
    return {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
        title: {
          display: true,
          text: title,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: this.lightModeColors.grid,
          },
        },
        x: {
          grid: {
            color: this.lightModeColors.grid,
          },
        },
      },
    };
  }

  updateChartsTheme(isDarkMode) {
    const colors = isDarkMode ? this.darkModeColors : this.lightModeColors;

    Object.values(this.charts).forEach((chart) => {
      if (!chart) return;

      // Mettre à jour les couleurs du graphique
      if (chart.config.type === "line" || chart.config.type === "bar") {
        chart.options.scales.y.grid.color = colors.grid;
        chart.options.scales.x.grid.color = colors.grid;
      }

      // Mettre à jour les couleurs du texte
      chart.options.plugins.title.color = colors.text;
      chart.options.plugins.legend.labels.color = colors.text;

      chart.update();
    });
  }

  updateQuotaChart(used, limit) {
    if (!this.charts.quota) return;

    const percentage = (used / limit) * 100;
    const remaining = 100 - percentage;

    this.charts.quota.data.datasets[0].data = [percentage, remaining];
    this.charts.quota.update();
  }

  // Méthode pour mettre à jour tous les graphiques
  async updateAllCharts() {
    try {
      await Promise.all([
        this.updateWatchTimeChart(),
        this.updateVideoAddedChart(),
        this.updateChannelActivityChart(),
      ]);
    } catch (error) {
      console.error("Erreur lors de la mise à jour des graphiques:", error);
    }
  }

  // Méthodes de mise à jour individuelles
  async updateWatchTimeChart() {
    const response = await fetch("/get_daily_stats?days=7");
    const data = await response.json();

    if (data.success && this.charts.watchTime) {
      this.charts.watchTime.data.datasets[0].data = data.daily_stats.map(
        (stat) => stat.watch_time
      );
      this.charts.watchTime.update();
    }
  }

  async updateVideoAddedChart() {
    const response = await fetch("/get_daily_stats?days=30");
    const data = await response.json();

    if (data.success && this.charts.videosAdded) {
      this.charts.videosAdded.data.datasets[0].data = data.daily_stats.map(
        (stat) => stat.videos
      );
      this.charts.videosAdded.update();
    }
  }

  async updateChannelActivityChart() {
    const response = await fetch("/get_channel_activity");
    const data = await response.json();

    if (data.success && this.charts.channelActivity) {
      this.charts.channelActivity.data.datasets[0].data = data.channels.map(
        (channel) => channel.video_count
      );
      this.charts.channelActivity.update();
    }
  }

  // Nettoyage des graphiques
  destroyCharts() {
    Object.values(this.charts).forEach((chart) => {
      if (chart) {
        chart.destroy();
      }
    });
    this.charts = {};
  }
}

// Exporter l'instance pour une utilisation globale
window.chartsManager = new ChartsManager();
