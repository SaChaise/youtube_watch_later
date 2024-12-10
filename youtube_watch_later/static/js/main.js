// Variables globales (en haut du fichier main.js)
let subscriptions = [];
let isMonitoring = false;
let selectedHours = new Set();
let isInitialized = false;
let retryCount = 0;
let timeSelector;
const MAX_RETRIES = 3;
let selectedDateLimit = "24h";
let currentChannelId = null;

// Fonctions de gestion du quota (après les variables globales)
async function updateQuotaDisplay() {
  if (document.hidden) return; // Ne pas mettre à jour si la page est cachée

  try {
    const response = await apiService.getQuotaStatus();
    if (!response.success) return;

    const quotaElement = document.getElementById("apiQuota");
    if (!quotaElement) return;

    if (response.quota.loading) {
      quotaElement.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    Chargement...
                </div>
            `;
      return;
    }

    const { used, limit, percentage_used, time_until_reset } = response.quota;
    const remaining = limit - used;

    quotaElement.innerHTML = `
            <div class="text-2xl font-bold ${
              percentage_used > 90 ? "text-red-600" : "text-blue-600"
            }">
                ${remaining.toLocaleString()} / ${limit.toLocaleString()}
            </div>
            <div class="text-sm text-gray-600">
                ${time_until_reset}
            </div>
        `;
  } catch (error) {
    console.error("Erreur lors de la mise à jour du quota:", error);
  }
}

function startQuotaUpdates() {
  if (quotaUpdateTimer) clearInterval(quotaUpdateTimer);
  quotaUpdateTimer = setInterval(updateQuotaDisplay, 5000); // Mise à jour toutes les 5 secondes
  updateQuotaDisplay(); // Mise à jour immédiate
}

function stopQuotaUpdates() {
  if (quotaUpdateTimer) {
    clearInterval(quotaUpdateTimer);
    quotaUpdateTimer = null;
  }
}

function updateCheckInterval() {
  const select = document.getElementById("videoDateLimit");
  currentDateLimit = select.value;

  // Sauvegarder la préférence
  localStorage.setItem("checkInterval", currentDateLimit);

  // Si la surveillance est active, la redémarrer avec le nouvel intervalle
  if (isMonitoring) {
    stopMonitoring().then(() => {
      startMonitoring();
    });
  }
}
// Au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  // Restaurer la préférence sauvegardée
  const savedInterval = localStorage.getItem("checkInterval");
  if (savedInterval) {
    currentDateLimit = savedInterval;
    document.getElementById("videoDateLimit").value = savedInterval;
  }
});

async function startMonitoring() {
  try {
    const response = await fetch(
      `/start_monitoring?date_limit=${encodeURIComponent(currentDateLimit)}`
    );
    const data = await response.json();

    if (data.success) {
      isMonitoring = true;
      updateMonitoringUI();
      showToast(
        `Surveillance démarrée (vidéos < ${currentDateLimit})`,
        "success"
      );
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error("Erreur lors du démarrage de la surveillance:", error);
    showToast(error.message, "error");
  }
}

// Modification de la fonction d'initialisation existante
async function initializeApp() {
  try {
    console.log("Début du chargement...");
    showElement(document.getElementById("initialLoadingOverlay"));

    // Vérification de l'état de l'authentification
    const authStatus = await checkAuthStatus();
    console.log("État de l'authentification:", authStatus);

    if (!authStatus.success) {
      throw new Error("Problème d'authentification");
    }

    // Arrêter les mises à jour du quota pendant le chargement
    stopQuotaUpdates();

    // Chargement des données
    await Promise.all([
      loadSubscriptionsWithRetry(),
      loadCheckHours(),
      loadWatchLaterVideos(),
    ]);

    // Démarrer les mises à jour du quota après le chargement
    startQuotaUpdates();

    // Mettre à jour les statistiques
    updateStatistics();

    isInitialized = true;
  } catch (error) {
    console.error("Erreur lors de l'initialisation:", error);
    showToast(error.message, "error");
  } finally {
    hideElement(document.getElementById("initialLoadingOverlay"));
  }
}

// Ajout des event listeners (après toutes les fonctions)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopQuotaUpdates();
  } else {
    startQuotaUpdates();
  }
});

// Initialisation
async function initializeApp() {
  try {
    console.log("Début du chargement...");
    showElement(document.getElementById("initialLoadingOverlay"));

    // Vérification de l'état de l'authentification
    const authStatus = await checkAuthStatus();
    console.log("État de l'authentification:", authStatus);

    if (!authStatus.success) {
      throw new Error("Problème d'authentification");
    }

    // Chargement des données
    await Promise.all([
      loadSubscriptionsWithRetry(),
      loadCheckHours(),
      loadWatchLaterVideos(),
      updateQuotaDisplay(), // Ajout ici
    ]);

    // Mettre en place la mise à jour périodique du quota
    setInterval(updateQuotaDisplay, 60000); // Mise à jour toutes les minutes

    // Mettre à jour les statistiques
    updateStatistics();

    isInitialized = true;
  } catch (error) {
    console.error("Erreur lors de l'initialisation:", error);
    showToast(error.message, "error");
  } finally {
    hideElement(document.getElementById("initialLoadingOverlay"));
  }
}

// Démarrage de l'application quand le DOM est chargé
document.addEventListener("DOMContentLoaded", () => {
  console.log("Application initialisée");
  initializeApp();
  setupEventListeners();
  startDebugMode();
});

// Configuration des écouteurs d'événements
function setupEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const filterSelect = document.getElementById("filterSelect");

  searchInput?.addEventListener("input", debounce(filterAndSortChannels, 300));
  sortSelect?.addEventListener("change", filterAndSortChannels);
  filterSelect?.addEventListener("change", filterAndSortChannels);

  // Vérifications périodiques
  setInterval(checkQuotaStatus, 300000); // 5 minutes
  setInterval(updateStatistics, 60000); // 1 minute

  // Raccourcis clavier
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// Vérification de l'état de l'authentification
async function checkAuthStatus() {
  try {
    const response = await fetch("/debug/auth_status");
    const data = await response.json();
    console.log("État de l'authentification:", data);
    return data;
  } catch (error) {
    console.error(
      "Erreur lors de la vérification de l'authentification:",
      error
    );
    return { success: false, error: error.message };
  }
}

// Fonction pour récupérer les chaînes avec retry
async function fetchChannelsWithRetry(maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch("/get_subscriptions");
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(
          data.error || "Erreur lors de la récupération des abonnements"
        );
      }

      return data;
    } catch (error) {
      console.warn(`Tentative ${i + 1}/${maxRetries} échouée:`, error);
      lastError = error;

      if (i < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i))
        );
      }
    }
  }

  throw lastError;
}

// Chargement des abonnements avec retry
async function loadSubscriptionsWithRetry() {
  console.log("Chargement des abonnements...");
  showElement(document.getElementById("loader"));

  try {
    // Première requête pour obtenir les abonnements
    const response = await fetch("/get_subscriptions");
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(
        data.error || "Erreur lors de la récupération des abonnements"
      );
    }

    // Deuxième requête pour obtenir les chaînes sélectionnées
    const selectedResponse = await fetch("/get_selected_channels");
    const selectedData = await selectedResponse.json();

    if (selectedData.success) {
      // Créer un Set des IDs des chaînes sélectionnées
      const selectedIds = new Set(selectedData.channel_ids);

      // S'assurer que subscriptions est un tableau
      subscriptions = Array.isArray(data.subscriptions)
        ? data.subscriptions
        : [];

      // Mettre à jour l'état selected de chaque chaîne
      subscriptions = subscriptions.map((channel) => ({
        ...channel,
        selected: selectedIds.has(channel.id),
      }));
    } else {
      // S'assurer que subscriptions est un tableau même en cas d'erreur
      subscriptions = Array.isArray(data.subscriptions)
        ? data.subscriptions
        : [];
    }

    console.log(`${subscriptions.length} chaînes chargées`);
    console.log(
      "Chaînes sélectionnées:",
      subscriptions.filter((c) => c.selected).length
    );

    updateMonitoringUI();
    filterAndSortChannels(); // Affiche les chaînes
    updateStatistics(); // Met à jour les statistiques
  } catch (error) {
    console.error("Erreur lors du chargement des abonnements:", error);
    showToast(error.message, "error");
    // En cas d'erreur, s'assurer que subscriptions est un tableau vide
    subscriptions = [];
  } finally {
    hideElement(document.getElementById("loader"));
  }
}

// Mode debug
function startDebugMode() {
  console.log("Mode debug activé");
  window.debugApp = {
    getSubscriptions: () => subscriptions,
    getMonitoringStatus: () => isMonitoring,
    getSelectedHours: () => Array.from(selectedHours),
    reloadSubscriptions: loadSubscriptionsWithRetry,
    checkAuth: checkAuthStatus,
    quotaStatus: checkQuotaStatus,
  };
}

// Chargement des horaires
async function loadCheckHours() {
  try {
    const response = await fetch("/get_monitoring_status");
    const data = await response.json();

    if (data.success) {
      selectedHours = new Set(data.status.check_hours);
      updateTimeSelector();
      isMonitoring = data.is_monitoring;
      updateMonitoringUI();
    }
  } catch (error) {
    console.error("Erreur lors du chargement des horaires:", error);
    showToast("Erreur lors du chargement des horaires", "error");
  }
}

async function updateChannelSelection(channelId) {
  try {
    // Trouver la chaîne dans la liste
    const channel = subscriptions.find((c) => c.id === channelId);
    if (!channel) return;

    // Sauvegarder l'ancien état
    const oldSelectedChannels = subscriptions.filter((c) => c.selected).length;

    // Mettre à jour l'état local
    channel.selected = !channel.selected;

    // Récupérer toutes les chaînes sélectionnées
    const selectedChannels = subscriptions
      .filter((c) => c.selected)
      .map((c) => c.id);

    const response = await apiService.saveSelectedChannels(selectedChannels);

    if (!response.success) {
      // Restaurer l'ancien état en cas d'erreur
      channel.selected = !channel.selected;
      throw new Error(response.error || "Erreur lors de la sauvegarde");
    }

    // Mettre à jour l'affichage sans recharger toutes les chaînes
    const totalChannelsElement = document.getElementById("totalChannels");
    const selectedChannelsElement = document.getElementById("selectedChannels");

    if (selectedChannelsElement) {
      selectedChannelsElement.textContent = selectedChannels.length;
    }
    if (totalChannelsElement && subscriptions) {
      totalChannelsElement.textContent = subscriptions.length;
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la chaîne:", error);
    showToast(error.message, "error");
  }
}

// Dans main.js
async function checkQuotaAndExecute(apiCall) {
  try {
    const quotaStatus = await apiService.getQuotaStatus();
    if (quotaStatus.quota?.percentage_used > 95) {
      apiService.handleQuotaError();
      return false;
    }

    const result = await apiCall();
    return result;
  } catch (error) {
    if (error.message?.toLowerCase().includes("quota")) {
      apiService.handleQuotaError();
      return false;
    }
    throw error;
  }
}

// Exemple d'utilisation:
async function refreshChannels() {
  const result = await checkQuotaAndExecute(() => apiService.refreshChannels());
  if (result) {
    // Traiter le résultat
    subscriptions = result.subscriptions;
    filterAndSortChannels();
  }
}

async function checkWatchedVideos() {
  const button = document.getElementById("checkWatchedButton");

  try {
    // Désactiver le bouton et montrer l'animation
    if (button) {
      button.disabled = true;
      button.innerHTML = `
                <div class="flex items-center">
                    <i class="fas fa-spinner fa-spin mr-2"></i>
                    <span>Vérification en cours...</span>
                </div>
            `;
    }

    const response = await fetch("/check_watched_videos");
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Erreur lors de la vérification");
    }

    // Mise à jour des statistiques avec animation
    if (data.removed_count > 0) {
      // Mise à jour du compteur de vidéos
      const totalVideosElement = document.getElementById("totalVideos");
      if (totalVideosElement) {
        animateNumber(
          totalVideosElement,
          data.stats.previous.total_videos,
          data.stats.current.total_videos
        );
      }

      // Mise à jour du temps de visionnage
      const watchTimeElement = document.getElementById("totalWatchTime");
      if (watchTimeElement) {
        const previousTime = data.stats.previous.total_watch_time;
        const currentTime = data.stats.current.total_watch_time;
        animateWatchTime(watchTimeElement, previousTime, currentTime);
      }

      // Afficher une notification de succès
      showVideoRemovedNotification(
        data.removed_count,
        data.stats.differences.watch_time
      );
    }

    // Recharger la liste des vidéos
    await loadWatchLaterVideos();

    // Message toast approprié
    const message =
      data.removed_count > 0
        ? `${data.removed_count} vidéo${
            data.removed_count > 1 ? "s" : ""
          } regardée${data.removed_count > 1 ? "s" : ""} retirée${
            data.removed_count > 1 ? "s" : ""
          }`
        : "Aucune vidéo à retirer";

    showToast(message, data.removed_count > 0 ? "success" : "info");
  } catch (error) {
    console.error("Erreur lors de la vérification:", error);
    showToast(error.message, "error");
  } finally {
    // Restaurer le bouton
    if (button) {
      button.disabled = false;
      button.innerHTML = `
                <i class="fas fa-check mr-2"></i>
                Vérifier les vidéos regardées
            `;
    }
  }
}

function showVideoRemovedNotification(count, timeSaved) {
  const notification = document.createElement("div");
  notification.className =
    "fixed bottom-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50 animate-slide-in";
  notification.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <i class="fas fa-check-circle text-2xl"></i>
            </div>
            <div>
                <h4 class="font-bold">Nettoyage terminé</h4>
                <p class="text-sm">${count} vidéo${
    count > 1 ? "s" : ""
  } retirée${count > 1 ? "s" : ""}</p>
                <p class="text-xs mt-1">Temps libéré: ${formatWatchTime(
                  timeSaved
                )}</p>
            </div>
        </div>
    `;

  document.body.appendChild(notification);

  // Animation de sortie après 5 secondes
  setTimeout(() => {
    notification.classList.add("animate-slide-out");
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

function animateNumber(element, start, end) {
  const duration = 1000; // 1 seconde
  const steps = 60;
  const step = (end - start) / steps;
  let current = start;
  let count = 0;

  const animation = setInterval(() => {
    current += step;
    count++;

    element.textContent = Math.round(current);
    element.classList.add("update-animation");

    if (count >= steps) {
      clearInterval(animation);
      element.textContent = end;
      element.classList.remove("update-animation");
    }
  }, duration / steps);
}

function animateWatchTime(element, start, end) {
  const duration = 1000;
  const steps = 60;
  const step = (end - start) / steps;
  let current = start;
  let count = 0;

  const animation = setInterval(() => {
    current += step;
    count++;

    element.textContent = formatWatchTime(current);
    element.classList.add("update-animation");

    if (count >= steps) {
      clearInterval(animation);
      element.textContent = formatWatchTime(end);
      element.classList.remove("update-animation");
    }
  }, duration / steps);
}

function formatWatchTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours > 0) {
    return `${hours}h${String(remainingMinutes).padStart(2, "0")}min`;
  }
  return `${remainingMinutes}min`;
}

function animateCounter(element, start, end, formatter = (value) => value) {
  const duration = 1000; // 1 seconde
  const steps = 60;
  const increment = (end - start) / steps;
  let current = start;
  let step = 0;

  const animation = setInterval(() => {
    step++;
    current += increment;

    if (step >= steps) {
      current = end;
      clearInterval(animation);
    }

    element.textContent = formatter(current);

    // Ajouter une classe d'animation CSS
    element.classList.add("update-animation");
    setTimeout(() => element.classList.remove("update-animation"), 300);
  }, duration / steps);
}

function formatWatchTime(minutes) {
  if (typeof minutes !== "number") return "0min";

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours > 0) {
    return `${hours}h${remainingMinutes.toString().padStart(2, "0")}min`;
  }
  return `${remainingMinutes}min`;
}

async function refreshChannels() {
  const button = document.getElementById("refreshChannelsButton");

  try {
    // Désactiver le bouton et montrer l'animation
    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
    }

    // Afficher le loader
    const loader = document.getElementById("loader");
    if (loader) showElement(loader);

    const response = await apiService.refreshChannels();

    if (!response.success) {
      throw new Error(response.error || "Erreur lors de l'actualisation");
    }

    // Mettre à jour les données
    subscriptions = response.subscriptions;

    // Mettre à jour l'affichage
    filterAndSortChannels();
    updateStatistics();

    showToast("Chaînes YouTube actualisées", "success");
  } catch (error) {
    console.error("Erreur lors de l'actualisation des chaînes:", error);
    showToast(error.message, "error");
  } finally {
    // Restaurer le bouton et cacher le loader
    if (button) {
      button.disabled = false;
      button.innerHTML =
        '<i class="fas fa-sync-alt mr-2"></i>Actualiser les chaînes';
    }
    const loader = document.getElementById("loader");
    if (loader) hideElement(loader);
  }
}

async function refreshChannels() {
  const button = document.getElementById("refreshChannelsButton");
  const status = document.getElementById("refreshStatus");
  const totalChannels = document.getElementById("totalChannels");
  const channelsFoundAnimation = document.getElementById(
    "channelsFoundAnimation"
  );
  const newChannelsCount = document.getElementById("newChannelsCount");
  const progress = document.getElementById("refreshProgress");
  let startTime = Date.now();
  const previousCount = subscriptions.length;

  try {
    // Désactiver le bouton et montrer l'animation
    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
    }

    // Afficher la zone de statut
    showElement(status);

    // Afficher le loader
    showElement(document.getElementById("loader"));

    const response = await apiService.refreshChannels();

    if (!response.success) {
      throw new Error(response.error || "Erreur lors de l'actualisation");
    }

    // Mettre à jour les données
    subscriptions = response.subscriptions;

    // Mettre à jour le compteur avec animation
    if (totalChannels) {
      let count = previousCount;
      const total = subscriptions.length;
      const duration = 1000; // 1 seconde pour l'animation
      const interval = 20; // Mise à jour toutes les 20ms
      const increment = (total - previousCount) / (duration / interval);

      const counter = setInterval(() => {
        count = Math.min(count + increment, total);
        totalChannels.textContent = Math.floor(count);
        if (count >= total) {
          clearInterval(counter);

          // Montrer l'animation de nouvelles chaînes
          if (total > previousCount) {
            showElement(channelsFoundAnimation);
            newChannelsCount.textContent = `+${total - previousCount}`;
            setTimeout(() => {
              channelsFoundAnimation.classList.add("fade-out");
              setTimeout(() => {
                hideElement(channelsFoundAnimation);
                channelsFoundAnimation.classList.remove("fade-out");
              }, 300);
            }, 3000);
          }
        }
      }, interval);
    }

    // Mettre à jour le message de progression
    if (progress) {
      const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      progress.textContent = `Actualisation terminée en ${timeElapsed} secondes`;
    }

    // Mettre à jour l'affichage
    filterAndSortChannels();
    updateStatistics();

    showToast(`${subscriptions.length} chaînes YouTube actualisées`, "success");
  } catch (error) {
    console.error("Erreur lors de l'actualisation des chaînes:", error);
    if (progress) {
      progress.textContent = `Erreur: ${error.message}`;
      progress.classList.add("text-red-500");
    }
    showToast(error.message, "error");
  } finally {
    // Restaurer le bouton
    if (button) {
      button.disabled = false;
      button.innerHTML =
        '<i class="fas fa-sync-alt mr-2"></i>Actualiser les chaînes';
    }

    // Cacher le loader
    hideElement(document.getElementById("loader"));

    // Cacher le statut après 3 secondes
    setTimeout(() => {
      if (status) {
        status.classList.add("fade-out");
        setTimeout(() => {
          hideElement(status);
          status.classList.remove("fade-out");
        }, 300);
      }
    }, 3000);
  }
}

// Dans main.js, ajoutez cette fonction
async function updateVideoCount() {
  try {
    const response = await apiService.getWatchLaterVideos();
    if (!response.success) return;

    const totalVideos = document.getElementById("totalVideos");
    const previousCount = parseInt(totalVideos.textContent) || 0;
    const newCount = response.videos.length;

    // Animation du compteur
    animateCounter(totalVideos, previousCount, newCount);

    // Afficher +X si nouvelles vidéos
    if (newCount > previousCount) {
      const newVideosAnimation = document.getElementById("newVideosAnimation");
      const newVideosCount = document.getElementById("newVideosCount");
      newVideosCount.textContent = `+${newCount - previousCount}`;
      showElement(newVideosAnimation);

      setTimeout(() => {
        newVideosAnimation.classList.add("fade-out");
        setTimeout(() => {
          hideElement(newVideosAnimation);
          newVideosAnimation.classList.remove("fade-out");
        }, 300);
      }, 3000);
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du nombre de vidéos:", error);
  }
}

// Appelez updateVideoCount() dans les endroits appropriés :
// - Au chargement initial
// - Après l'ajout d'une vidéo
// - Après la suppression d'une vidéo
// - Après le rafraîchissement de la liste

// Mise à jour des statistiques
function updateStatistics() {
  const totalChannels = document.getElementById("totalChannels");
  const selectedChannels = document.getElementById("selectedChannels");

  if (totalChannels && subscriptions) {
    totalChannels.textContent = subscriptions.length;
  }

  if (selectedChannels && subscriptions) {
    selectedChannels.textContent = subscriptions.filter(
      (c) => c.selected
    ).length;
  }
}

// Vérification du quota
async function checkQuotaStatus() {
  try {
    const response = await fetch("/debug/quota");
    const data = await response.json();

    if (data.success) {
      const quotaElement = document.getElementById("apiQuota");
      if (quotaElement) {
        const percentage =
          100 - Math.round((data.quota.used / data.quota.limit) * 100);
        quotaElement.textContent = `${percentage}%`;
        quotaElement.classList.toggle("text-red-600", percentage < 10);
        quotaElement.classList.toggle(
          "text-yellow-600",
          percentage >= 10 && percentage < 30
        );
      }
    }
  } catch (error) {
    console.error("Erreur lors de la vérification du quota:", error);
  }
}

// Mise à jour de l'interface de surveillance
function updateMonitoringUI() {
  const button = document.getElementById("monitoringButton");
  if (!button) return;

  if (isMonitoring) {
    button.innerHTML = '<i class="fas fa-stop mr-1"></i> Arrêter';
    button.classList.remove("bg-green-500", "hover:bg-green-600");
    button.classList.add("bg-red-500", "hover:bg-red-600");
  } else {
    button.innerHTML = '<i class="fas fa-play mr-1"></i> Démarrer';
    button.classList.remove("bg-red-500", "hover:bg-red-600");
    button.classList.add("bg-green-500", "hover:bg-green-600");
  }
}

// Filtrage et tri des chaînes
function filterAndSortChannels() {
  if (!Array.isArray(subscriptions)) {
    console.error("subscriptions n'est pas un tableau", subscriptions);
    subscriptions = [];
    return;
  }

  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const filterSelect = document.getElementById("filterSelect");

  const searchTerm = (searchInput?.value || "").toLowerCase();
  const sortValue = sortSelect?.value || "nameAsc";
  const filterValue = filterSelect?.value || "all";

  let filtered = subscriptions.filter((channel) => {
    const matchesSearch = channel.title.toLowerCase().includes(searchTerm);
    const matchesFilter =
      filterValue === "all" ||
      (filterValue === "selected" && channel.selected) ||
      (filterValue === "unselected" && !channel.selected);
    return matchesSearch && matchesFilter;
  });

  filtered.sort((a, b) => {
    switch (sortValue) {
      case "nameAsc":
        return a.title.localeCompare(b.title);
      case "nameDesc":
        return b.title.localeCompare(a.title);
      case "subsDesc":
        return parseInt(b.subscriberCount) - parseInt(a.subscriberCount);
      case "subsAsc":
        return parseInt(a.subscriberCount) - parseInt(b.subscriberCount);
      case "videosDesc":
        return parseInt(b.videoCount) - parseInt(a.videoCount);
      case "videosAsc":
        return parseInt(a.videoCount) - parseInt(b.videoCount);
      default:
        return 0;
    }
  });

  console.log(`${filtered.length} chaînes après filtrage`);
  displayChannels(filtered);
}

// Affichage des chaînes
function displayChannels(channels) {
  const channelList = document.getElementById("channelList");
  if (!channelList) return;

  if (!channels || channels.length === 0) {
    displayEmptyState(channelList, "channel");
    return;
  }

  channelList.innerHTML = channels
    .map(
      (channel) => `
        <div class="channel-card bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 
                    hover:shadow-lg transition-all duration-300 ${
                      channel.selected ? "selected border border-red-500" : ""
                    }"
             data-channel-id="${channel.id}">
            <div class="flex items-center space-x-4">
                <img src="${channel.thumbnail}" 
                     alt="${channel.title}" 
                     class="w-16 h-16 rounded-full transition-transform duration-300 hover:scale-105"
                     loading="lazy">
                <div class="flex-grow mr-4">
                    <h3 class="font-semibold text-gray-800 dark:text-white hover:text-red-600 cursor-pointer transition-colors duration-200"
                        onclick="showChannelDetails('${channel.id}')">
                        ${channel.title}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        ${formatNumber(channel.subscriberCount)} abonnés<br>
                        ${formatNumber(channel.videoCount)} vidéos
                    </p>
                </div>
                <div class="flex items-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" 
                               class="sr-only peer"
                               data-channel-id="${channel.id}"
                               onchange="updateChannelSelection('${
                                 channel.id
                               }')"
                               ${channel.selected ? "checked" : ""}>
                        <div class="w-14 h-7 bg-gray-200 peer-focus:ring-4 
                                  peer-focus:ring-red-300 dark:peer-focus:ring-red-800 
                                  rounded-full peer dark:bg-gray-700 
                                  peer-checked:after:translate-x-full 
                                  peer-checked:after:border-white 
                                  after:content-[''] after:absolute 
                                  after:top-0.5 after:left-[4px] 
                                  after:bg-white after:border-gray-300 
                                  after:border after:rounded-full 
                                  after:h-6 after:w-6 after:transition-all
                                  dark:border-gray-600 
                                  peer-checked:bg-red-600"></div>
                    </label>
                </div>
            </div>
        </div>
    `
    )
    .join("");

  // Mettre à jour les statistiques après l'affichage
  updateStatistics();
}

function formatNumber(num) {
  try {
    const n = parseInt(num);
    if (isNaN(n)) return "0";

    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    } else if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return n.toString();
  } catch (e) {
    console.error("Erreur lors du formatage du nombre:", e);
    return "0";
  }
}

async function displayChannelDetails(channelId) {
  try {
    const response = await apiService.getChannelVideos(channelId);
    const videos = response.videos;

    const channel = subscriptions.find((c) => c.id === channelId);
    if (!channel) return;

    // ... le reste du code existant ...

    // Dans la partie où vous générez le HTML des vidéos, modifiez le bouton d'ajout :
    const videoHTML = videos
      .map(
        (video) => `
            <div class="video-card bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <div class="relative group">
                    <img src="${video.thumbnail}" 
                         alt="${video.title}" 
                         class="w-full h-48 object-cover">
                    <div class="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
                        ${formatDuration(video.duration)}
                    </div>
                </div>
                
                <div class="p-4">
                    <h3 class="font-semibold text-gray-800 dark:text-white mb-2 line-clamp-2">
                        ${video.title}
                    </h3>
                    
                    <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <div>
                            <i class="fas fa-eye mr-1"></i>
                            ${formatNumber(video.viewCount)}
                        </div>
                        <div>
                            <i class="fas fa-thumbs-up mr-1"></i>
                            ${formatNumber(video.likeCount)}
                        </div>
                    </div>
                    
                    <div class="flex justify-between mt-4 space-x-2">
                        <a href="https://youtube.com/watch?v=${video.id}" 
                           target="_blank"
                           class="flex-1 text-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                            <i class="fas fa-play mr-1"></i>
                            Regarder
                        </a>
                        
                        <button onclick="addToWatchLater('${
                          video.id
                        }', '${video.title.replace(/'/g, "\\'")}')"
                                class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                            <i class="fas fa-plus mr-1"></i>
                            Ajouter
                        </button>
                    </div>
                </div>
            </div>
        `
      )
      .join("");

    // ... le reste du code existant ...
  } catch (error) {
    console.error("Erreur lors du chargement des vidéos:", error);
    showToast(error.message, "error");
  }
}

async function addToWatchLater(videoId, title) {
  const button = document.querySelector(
    `button[onclick="addToWatchLater('${videoId}', '${title.replace(
      /'/g,
      "\\'"
    )}')"]`
  );

  try {
    if (button) {
      // Désactiver le bouton pendant l'ajout
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const result = await apiService.addToWatchLater(videoId, title);

    if (result.success) {
      // Rafraîchir uniquement si l'ajout est réussi et que ce n'est pas un Short
      await loadWatchLaterVideos();
      updateStatistics();
    }
  } catch (error) {
    console.error("Erreur:", error);
  } finally {
    // Restaurer le bouton
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-plus mr-1"></i>Ajouter';
    }
  }
}

function showToast(message, type = "info") {
  const notifications = document.getElementById("notifications");
  if (!notifications) return;

  const toast = document.createElement("div");

  // Définir les couleurs selon le type
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  const icons = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  toast.className = `${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg mb-3 
                      flex items-center fade-in transform transition-all duration-300`;

  toast.innerHTML = `
        <i class="fas ${icons[type]} mr-2"></i>
        <span>${message}</span>
    `;

  notifications.appendChild(toast);

  // Animation de sortie
  setTimeout(() => {
    toast.classList.add("fade-out", "translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.showToast = showToast;

async function updateQuotaDisplay() {
  try {
    const response = await apiService.getQuotaStatus();
    if (response.success) {
      const quotaElement = document.getElementById("apiQuota");
      if (quotaElement) {
        if (response.quota.loading) {
          // Si les chaînes sont en cours de chargement, afficher un message d'attente
          quotaElement.innerHTML = `
                        <div class="loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            Chargement...
                        </div>
                    `;
          return;
        }

        const {
          used,
          used_by_channels,
          limit,
          percentage_used,
          time_until_reset,
        } = response.quota;

        const remaining = limit - used;

        quotaElement.innerHTML = `
                    <div class="text-2xl font-bold ${
                      percentage_used > 90 ? "text-red-600" : "text-blue-600"
                    }">
                        ${remaining.toLocaleString()} / ${limit.toLocaleString()}
                    </div>
                    <div class="text-sm text-gray-600">
                        ${time_until_reset}
                    </div>
                    ${
                      used_by_channels > 0
                        ? `
                        <div class="text-xs text-green-600 mt-1">
                            -${used_by_channels} par vérification de chaînes
                        </div>
                        `
                        : ""
                    }
                `;
      }
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du quota:", error);
  }
}

function initializeDatePicker() {
  const dateLimitSelect = document.getElementById("videoDateLimit");
  const customDatePicker = document.getElementById("customDatePicker");

  dateLimitSelect.addEventListener("change", function () {
    if (this.value === "custom") {
      customDatePicker.classList.remove("hidden");
      // Initialiser avec la date actuelle
      const now = new Date();
      document.getElementById("customDateTime").value = now
        .toISOString()
        .slice(0, 16);
    } else {
      customDatePicker.classList.add("hidden");
      selectedDateLimit = this.value;
      updateChannelVideos(); // Rafraîchir les vidéos avec la nouvelle limite
    }
  });

  // Fermer le date picker si on clique ailleurs
  document.addEventListener("click", function (event) {
    if (
      !customDatePicker.contains(event.target) &&
      event.target !== dateLimitSelect
    ) {
      customDatePicker.classList.add("hidden");
    }
  });
}

function applyCustomDate() {
  const customDate = document.getElementById("customDateTime").value;
  if (customDate) {
    selectedDateLimit = new Date(customDate).toISOString();
    document.getElementById("customDatePicker").classList.add("hidden");
    updateChannelVideos();
  }
}

// Fonction pour obtenir l'ID de la chaîne actuelle
function getCurrentChannelId() {
  return currentChannelId;
}

async function updateChannelVideos() {
  const channelId = getCurrentChannelId();
  if (!channelId) {
    showToast("Aucune chaîne sélectionnée", "warning");
    return;
  }

  try {
    const dateLimit = document.getElementById("videoDateLimit").value;
    const response = await fetch(
      `/get_recent_videos/${channelId}?date_limit=${encodeURIComponent(
        dateLimit
      )}`
    );
    const data = await response.json();

    if (data.success) {
      displayChannelVideos(data.videos);
    } else {
      throw new Error(
        data.error || "Erreur lors de la récupération des vidéos"
      );
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des vidéos:", error);
    showToast(error.message, "error");
  }
}

// Appeler initializeDatePicker au chargement de la page
document.addEventListener("DOMContentLoaded", initializeDatePicker);
// Dans main.js

let quotaUpdateTimer = null;

async function updateQuotaDisplay() {
  if (document.hidden) return; // Ne pas mettre à jour si la page est cachée

  try {
    const response = await apiService.getQuotaStatus();
    if (!response.success) return;

    const quotaElement = document.getElementById("apiQuota");
    if (!quotaElement) return;

    if (response.quota.loading) {
      quotaElement.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    Chargement...
                </div>
            `;
      return;
    }

    const { used, limit, percentage_used, time_until_reset } = response.quota;
    const remaining = limit - used;

    quotaElement.innerHTML = `
            <div class="text-2xl font-bold ${
              percentage_used > 90 ? "text-red-600" : "text-blue-600"
            }">
                ${remaining.toLocaleString()} / ${limit.toLocaleString()}
            </div>
            <div class="text-sm text-gray-600">
                ${time_until_reset}
            </div>
        `;
  } catch (error) {
    console.error("Erreur lors de la mise à jour du quota:", error);
  }
}

function startQuotaUpdates() {
  if (quotaUpdateTimer) clearInterval(quotaUpdateTimer);
  quotaUpdateTimer = setInterval(updateQuotaDisplay, 5000); // Mise à jour toutes les 5 secondes
  updateQuotaDisplay(); // Mise à jour immédiate
}

function stopQuotaUpdates() {
  if (quotaUpdateTimer) {
    clearInterval(quotaUpdateTimer);
    quotaUpdateTimer = null;
  }
}

// Gestionnaire de visibilité de la page
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopQuotaUpdates();
  } else {
    startQuotaUpdates();
  }
});

// Dans la fonction d'initialisation
document.addEventListener("DOMContentLoaded", () => {
  // ... autre code d'initialisation ...
  startQuotaUpdates();
});

// États vides
function displayEmptyState(container, type) {
  const emptyStates = {
    video: {
      icon: "fa-film",
      message: "Aucune vidéo disponible",
      subMessage: "Sélectionnez des chaînes pour voir leurs dernières vidéos",
    },
    channel: {
      icon: "fa-user-slash",
      message: "Aucune chaîne trouvée",
      subMessage: "Modifiez vos filtres pour voir plus de résultats",
    },
  };

  const state = emptyStates[type];
  container.innerHTML = `
        <div class="col-span-full">
            <div class="empty-state">
                <i class="fas ${state.icon} mb-4 text-gray-400"></i>
                <p class="text-lg text-gray-800 dark:text-white">${state.message}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">${state.subMessage}</p>
            </div>
        </div>
    `;
}

// Gestion des erreurs
function showError(message) {
  const error = document.getElementById("error");
  if (error) {
    error.innerHTML = `
            <div class="flex items-center text-red-600">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span>${message}</span>
            </div>
        `;
    showElement(error);
    setTimeout(() => hideElement(error), 5000);
  }
}

function formatNumber(num) {
  const n = parseInt(num);
  if (isNaN(n)) return "0";

  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  } else if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `Il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else if (hours < 24) {
      return `Il y a ${hours} heure${hours > 1 ? "s" : ""}`;
    } else if (days < 7) {
      return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
    } else {
      return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  } catch (e) {
    console.error("Erreur lors du formatage de la date:", e);
    return "Date inconnue";
  }
}

// Utilitaires UI
function showElement(element) {
  if (element) element.classList.remove("hidden");
}

function hideElement(element) {
  if (element) element.classList.add("hidden");
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Système de notifications
function showToast(message, type = "info", duration = 3000) {
  const notifications = document.getElementById("notifications");
  const toast = document.createElement("div");

  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  const icons = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  toast.className = `${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg mb-3 
                      flex items-center fade-in transform transition-all duration-300`;
  toast.innerHTML = `
        <i class="fas ${icons[type]} mr-2"></i>
        <span>${message}</span>
    `;

  notifications.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out", "translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Gestion des raccourcis clavier
function handleKeyboardShortcuts(e) {
  // Échap pour fermer les modaux
  if (e.key === "Escape") {
    closeAllModals();
  }

  // Ctrl/Cmd + F pour focus sur la recherche
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    document.getElementById("searchInput")?.focus();
  }

  // R pour rafraîchir les vidéos
  if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
    refreshLatestVideos();
  }
}

// Fermeture des modaux
function closeAllModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.classList.add("fade-out");
    setTimeout(() => modal.remove(), 300);
  });
}

// Export des fonctions globales
window.debugApp = {
  getSubscriptions: () => subscriptions,
  getLatestVideos: () => latestVideos,
  getMonitoringStatus: () => isMonitoring,
  getSelectedHours: () => Array.from(selectedHours),
  reloadSubscriptions: loadSubscriptionsWithRetry,
  checkAuth: checkAuthStatus,
  quotaStatus: checkQuotaStatus,
};

window.toggleMonitoring = toggleMonitoring;
window.showChannelDetails = showChannelDetails;
window.updateChannelSelection = updateChannelSelection;
window.toggleHour = toggleHour;
window.showToast = showToast;
window.selectAll = selectAll;

// Gestion de la surveillance
async function toggleMonitoring() {
  try {
    const dateLimitSelect = document.getElementById("videoDateLimit");
    const checkPeriod = dateLimitSelect.value;

    // Obtenir le statut actuel
    const statusResponse = await fetch("/get_monitoring_status");
    const statusData = await statusResponse.json();

    const isCurrentlyMonitoring = statusData.status.is_monitoring;

    const response = await fetch(
      isCurrentlyMonitoring
        ? "/stop_monitoring"
        : `/start_monitoring?check_period=${encodeURIComponent(checkPeriod)}`
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    isMonitoring = !isCurrentlyMonitoring;
    updateMonitoringUI();

    showToast(data.message, "success");
  } catch (error) {
    console.error("Erreur lors du changement de surveillance:", error);
    showToast(error.message, "error");
  }
}

// Sélection de toutes les chaînes
async function selectAll() {
  const checkboxes = document.querySelectorAll("input[data-channel-id]");
  const anyUnchecked = Array.from(checkboxes).some((cb) => !cb.checked);

  checkboxes.forEach((cb) => {
    cb.checked = anyUnchecked;
    const channelId = cb.dataset.channelId;
    const channel = subscriptions.find((c) => c.id === channelId);
    if (channel) {
      channel.selected = anyUnchecked;
    }
  });

  try {
    const selectedChannels = subscriptions
      .filter((c) => c.selected)
      .map((c) => c.id);

    const response = await fetch("/save_channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel_ids: selectedChannels,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error);
    }

    updateStatistics();
    showToast(
      anyUnchecked
        ? "Toutes les chaînes sélectionnées"
        : "Toutes les chaînes désélectionnées",
      "success"
    );
  } catch (error) {
    console.error("Erreur lors de la sélection multiple:", error);
    showToast("Erreur lors de la mise à jour", "error");
    // Rétablir l'état précédent
    checkboxes.forEach((cb) => {
      cb.checked = !cb.checked;
      const channelId = cb.dataset.channelId;
      const channel = subscriptions.find((c) => c.id === channelId);
      if (channel) {
        channel.selected = !channel.selected;
      }
    });
  }
}

// Dans main.js ou statistics.js
function formatWatchTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);

  if (hours > 0) {
    return `${hours}h${String(remainingMinutes).padStart(2, "0")}min`;
  } else {
    return `${remainingMinutes}min`;
  }
}

// Utiliser cette fonction lors de l'affichage des statistiques
function updateWatchTimeDisplay(time) {
  const watchTimeElement = document.getElementById("totalWatchTime");
  if (watchTimeElement) {
    const formattedTime =
      typeof time === "string" ? time : formatWatchTime(time);
    watchTimeElement.textContent = formattedTime;
  }
}

async function updateStatistics() {
  try {
    const response = await apiService.getStatistics();

    if (!response.success) {
      throw new Error(
        response.error || "Erreur lors de la récupération des statistiques"
      );
    }

    const stats = response.statistics;

    // Mise à jour des compteurs
    const elements = {
      totalVideos: document.getElementById("totalVideos"),
      totalWatchTime: document.getElementById("totalWatchTime"),
      selectedChannels: document.getElementById("selectedChannels"),
      apiQuota: document.getElementById("apiQuota"),
    };

    if (elements.totalVideos) {
      elements.totalVideos.textContent = stats.total_videos.toLocaleString();
    }

    if (elements.totalWatchTime) {
      const minutes = stats.total_watch_time;
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = Math.round(minutes % 60);
      elements.totalWatchTime.textContent =
        hours > 0
          ? `${hours}h ${remainingMinutes}min`
          : `${remainingMinutes}min`;
    }

    // ... reste du code ...
  } catch (error) {
    console.error("Erreur lors de la mise à jour des statistiques:", error);
  }
}

// Mettre en place une mise à jour périodique
setInterval(updateStatistics, 60000); // Mise à jour toutes les minutes

// Appeler immédiatement pour la première mise à jour
updateStatistics();

async function loadWatchLaterVideos() {
  const loader = document.getElementById("watchLaterLoader");
  const container = document.getElementById("watchLaterVideos");

  try {
    showElement(loader);
    hideElement(container);

    const response = await apiService.getWatchLaterVideos();

    if (!response.success) {
      throw new Error(response.error || "Erreur lors du chargement des vidéos");
    }

    displayWatchLaterVideos(response.videos);
    showToast("Vidéos mises à jour", "success");
  } catch (error) {
    console.error("Erreur:", error);
    showToast(error.message, "error");
  } finally {
    hideElement(loader);
    showElement(container);
  }
}

function formatDuration(duration) {
  try {
    // Format: PT#H#M#S
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "0:00";

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  } catch (e) {
    console.error("Erreur lors du formatage de la durée:", e);
    return "0:00";
  }
}

// Autres fonctions utilitaires de formatage
function formatNumber(num) {
  try {
    const n = parseInt(num);
    if (isNaN(n)) return "0";

    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    } else if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return n.toString();
  } catch (e) {
    console.error("Erreur lors du formatage du nombre:", e);
    return "0";
  }
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `Il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else if (hours < 24) {
      return `Il y a ${hours} heure${hours > 1 ? "s" : ""}`;
    } else if (days < 7) {
      return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
    } else {
      return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  } catch (e) {
    console.error("Erreur lors du formatage de la date:", e);
    return "Date inconnue";
  }
}

function displayWatchLaterVideos(videos) {
  const container = document.getElementById("watchLaterVideos");

  if (!videos || videos.length === 0) {
    container.innerHTML = `
            <div class="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                <i class="fas fa-video mb-4 text-4xl"></i>
                <p>Aucune vidéo dans votre playlist Watch Later Pro</p>
            </div>
        `;
    return;
  }

  container.innerHTML = videos
    .map(
      (video) => `
        <div class="video-card bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div class="relative">
                <img src="${video.thumbnail}" 
                     alt="${video.title}" 
                     class="w-full h-48 object-cover">
                <div class="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
                    ${formatDuration(video.duration)}
                </div>
            </div>
            
            <div class="p-4">
                <h3 class="font-semibold text-gray-800 dark:text-white mb-2 line-clamp-2">
                    ${video.title}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    ${video.channelTitle}
                </p>
                
                <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div>
                        <i class="fas fa-eye mr-1"></i>
                        ${formatNumber(video.viewCount)}
                    </div>
                    <div>
                        <i class="fas fa-thumbs-up mr-1"></i>
                        ${formatNumber(video.likeCount)}
                    </div>
                </div>
                
                <div class="flex justify-between mt-4">
                    <a href="https://youtube.com/watch?v=${video.id}" 
                       target="_blank"
                       class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                        <i class="fas fa-play mr-1"></i>
                        Regarder
                    </a>
                    <button onclick="removeFromWatchLater('${video.id}')"
                            class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white 
                                   rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <i class="fas fa-trash-alt mr-1"></i>
                        Retirer
                    </button>
                </div>
            </div>
        </div>
    `
    )
    .join("");
}

async function removeFromWatchLater(videoId) {
  try {
    const response = await apiService.removeFromWatchLater(videoId);
    if (!response.success) {
      throw new Error(response.error || "Erreur lors de la suppression");
    }

    // Mettre à jour les statistiques
    if (window.statisticsManager) {
      window.statisticsManager.updateStats({
        total_watch_time: response.new_watch_time,
      });
    }

    // Recharger les vidéos
    await loadWatchLaterVideos();

    showToast(
      `Vidéo retirée (${response.removed_duration.toFixed(2)} minutes)`,
      "success"
    );
  } catch (error) {
    console.error("Erreur:", error);
    showToast(error.message, "error");
  }
}

function refreshWatchLaterVideos() {
  loadWatchLaterVideos();
  showToast("Actualisation des vidéos...", "info");
}

// Gestion des détails d'une chaîne
async function showChannelDetails(channelId) {
  try {
    const response = await fetch(`/get_recent_videos/${channelId}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const channel = subscriptions.find((c) => c.id === channelId);
    if (!channel) return;

    // Création du modal avec taille ajustée
    const modal = document.createElement("div");
    modal.className =
      "modal fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center fade-in p-4";
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        <!-- En-tête -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-4">
              <img src="${channel.thumbnail}" 
                   alt="${channel.title}" 
                   class="w-16 h-16 rounded-full">
              <div>
                <h2 class="text-xl font-bold text-gray-800 dark:text-white">${
                  channel.title
                }</h2>
                <div class="flex items-center space-x-4 mt-1">
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    ${formatNumber(channel.subscriberCount)} abonnés
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    ${formatNumber(channel.videoCount)} vidéos
                  </div>
                </div>
              </div>
            </div>
            <button onclick="closeModal(this.closest('.modal'))" 
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
              <i class="fas fa-times fa-lg"></i>
            </button>
          </div>
        </div>

        <!-- Description -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <p class="text-sm text-gray-600 dark:text-gray-400 max-h-24 overflow-y-auto">
            ${channel.description || "Aucune description"}
          </p>
        </div>

        <!-- Liste des vidéos -->
        <div class="overflow-y-auto" style="max-height: calc(80vh - 200px);">
          <div class="p-4">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-4">Dernières vidéos</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${data.videos
                .map(
                  (video) => `
                <div class="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                  <div class="relative group">
                    <img src="${video.thumbnail}" 
                         alt="${video.title}" 
                         class="w-full h-36 object-cover">
                    <div class="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
                      ${formatDuration(video.duration)}
                    </div>
                  </div>
                  
                  <div class="p-3">
                    <h4 class="font-medium text-gray-800 dark:text-white text-sm line-clamp-2 mb-2">
                      ${video.title}
                    </h4>
                    
                    <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <span>${formatNumber(video.viewCount)} vues</span>
                      <span>${formatDate(video.publishedAt)}</span>
                    </div>
                    
                    <div class="flex justify-between items-center mt-2">
                      <a href="https://youtube.com/watch?v=${video.id}" 
                         target="_blank"
                         class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                        <i class="fas fa-play mr-1"></i>
                        Regarder
                      </a>
                      <button onclick="addToWatchLater('${
                        video.id
                      }', '${video.title.replace(/'/g, "\\'")}')"
                              class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                        <i class="fas fa-clock mr-1"></i>
                        Watch Later
                      </button>
                    </div>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Fermeture du modal lors du clic sur l'arrière-plan
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  } catch (error) {
    console.error("Erreur lors du chargement des détails de la chaîne:", error);
    showToast("Erreur lors du chargement des détails", "error");
  }
}

function displayChannelVideos(videos) {
  const modal = document.createElement("div");
  modal.className =
    "modal fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center fade-in p-4";
  modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <!-- En-tête -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div class="flex items-center space-x-4">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">Vidéos récentes</h2>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${
                      videos.length
                    } vidéos</span>
                </div>
                <button onclick="closeModal(this.closest('.modal'))" 
                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <i class="fas fa-times fa-lg"></i>
                </button>
            </div>

            <!-- Liste des vidéos -->
            <div class="overflow-y-auto p-4" style="max-height: calc(90vh - 80px);">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${videos
                      .map(
                        (video) => `
                        <div class="video-card bg-white dark:bg-gray-700 rounded-lg shadow overflow-hidden">
                            <div class="relative group">
                                <img src="${video.thumbnail}" 
                                     alt="${video.title}" 
                                     class="w-full h-48 object-cover">
                                <div class="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
                                    ${formatDuration(video.duration)}
                                </div>
                            </div>
                            
                            <div class="p-4">
                                <h3 class="font-semibold text-gray-800 dark:text-white mb-2 line-clamp-2">
                                    ${video.title}
                                </h3>
                                
                                <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    <div>
                                        <i class="fas fa-eye mr-1"></i>
                                        ${formatNumber(video.viewCount)}
                                    </div>
                                    <div>
                                        <i class="fas fa-thumbs-up mr-1"></i>
                                        ${formatNumber(video.likeCount)}
                                    </div>
                                </div>
                                
                                <div class="flex justify-between space-x-2">
                                    <a href="https://youtube.com/watch?v=${
                                      video.id
                                    }" 
                                       target="_blank"
                                       class="flex-1 text-center px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                                        <i class="fas fa-play mr-1"></i>
                                        Regarder
                                    </a>
                                    <button onclick="addToWatchLater('${
                                      video.id
                                    }', '${video.title.replace(/'/g, "\\'")}')"
                                            class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                                        <i class="fas fa-plus mr-1"></i>
                                        Ajouter
                                    </button>
                                </div>
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
}

// Fermeture d'un modal
function closeModal(modal) {
  if (modal) {
    modal.classList.add("fade-out");
    setTimeout(() => modal.remove(), 300);
  }
}
