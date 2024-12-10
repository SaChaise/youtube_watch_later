import json
from datetime import datetime, timedelta
import os
from typing import Dict, List, Optional
import logging
from isodate import parse_duration
from builtins import open


class StatisticsManager:
    def __init__(self, statistics_file: str):
        self.statistics_file = statistics_file
        self.logger = logging.getLogger(__name__)
        self._init_stats()
        self.automation = None

    def _init_stats(self):
        """Initialise ou charge les statistiques."""
        try:
            if os.path.exists(self.statistics_file):
                with open(self.statistics_file, "r", encoding="utf-8") as f:
                    self.stats = json.load(f)
            else:
                self.stats = {
                    "total_videos": 0,
                    "total_watch_time": 0,
                    "videos_by_month": {},
                    "daily_stats": {},
                    "selected_channels": 0,
                    "quota_usage": {
                        "used": 0,
                        "limit": 10000,
                        "reset_date": datetime.now().isoformat(),
                    },
                    "last_check": datetime.now().isoformat(),
                    "video_history": [],
                    # Ajout du suivi des vidéos
                    "tracked_videos": {},  # Format: {"video_id": {"duration": float, "added_at": str}}
                }
                self.save()
        except Exception as e:
            self.logger.error(
                f"Erreur lors de l'initialisation des statistiques: {str(e)}"
            )
            self._init_empty_stats()

    def process_video(self, video_data):
        """Traite les données d'une vidéo pour les statistiques."""
        try:
            # Convertir la durée en minutes
            duration = parse_duration(video_data.get("duration", "PT0S"))
            minutes = duration.total_seconds() / 60

            # Réinitialisation du temps total pour ne pas accumuler
            self.stats["total_watch_time"] = minutes

            # Mettre à jour les statistiques mensuelles
            month_key = datetime.now().strftime("%Y-%m")
            if month_key not in self.stats["videos_by_month"]:
                self.stats["videos_by_month"][month_key] = {"count": 0, "watch_time": 0}
            self.stats["videos_by_month"][month_key][
                "watch_time"
            ] = minutes  # = au lieu de +=

            self.save()

        except Exception as e:
            self.logger.error(
                f"Erreur lors du traitement des statistiques vidéo: {str(e)}"
            )

    def _init_empty_stats(self):
        """Initialise des statistiques vides en cas d'erreur."""
        self.stats = {
            "total_videos": 0,
            "total_watch_time": 0,
            "videos_by_month": {},
            "daily_stats": {},
            "selected_channels": 0,
            "quota_usage": {"used": 0, "limit": 10000},
            "last_check": datetime.now().isoformat(),
            "video_history": [],
        }

    def save(self):
        """Sauvegarde les statistiques dans le fichier."""
        try:
            # Créer le dossier parent si nécessaire
            os.makedirs(os.path.dirname(self.statistics_file), exist_ok=True)

            # Sauvegarder les statistiques
            with open(self.statistics_file, "w", encoding="utf-8") as f:
                json.dump(self.stats, f, indent=2)
        except Exception as e:
            self.logger.error(
                f"Erreur lors de la sauvegarde des statistiques: {str(e)}"
            )

    def set_automation(self, automation):
        """Défini l'instance de l'automatisation."""
        self.automation = automation

    def remove_video_from_stats(self, video_id: str):
        """Retire une vidéo des statistiques."""
        try:
            if video_id in self.stats["tracked_videos"]:
                removed_duration = self.stats["tracked_videos"][video_id]["duration"]
                del self.stats["tracked_videos"][video_id]

                # Recalculer le temps total
                total_time = sum(
                    v["duration"] for v in self.stats["tracked_videos"].values()
                )
                self.stats["total_watch_time"] = round(total_time, 2)

                self.save()
                self.logger.info(
                    f"Vidéo retirée du suivi: {video_id} (-{removed_duration:.2f} minutes)"
                )
                return removed_duration
            return 0
        except Exception as e:
            self.logger.error(f"Erreur lors du retrait de la vidéo des stats: {str(e)}")
            return 0

    def sync_tracked_videos(self, current_video_ids: List[str]):
        """Synchronise la liste des vidéos suivies avec la playlist actuelle."""
        try:
            current_ids_set = set(current_video_ids)
            tracked_ids_set = set(self.stats["tracked_videos"].keys())

            # Trouver les vidéos qui ne sont plus dans la playlist
            removed_ids = tracked_ids_set - current_ids_set

            # Retirer les vidéos qui ne sont plus présentes
            total_removed = 0
            for video_id in removed_ids:
                duration = self.remove_video_from_stats(video_id)
                total_removed += duration

            if total_removed > 0:
                self.logger.info(
                    f"Synchronisation : {len(removed_ids)} vidéos retirées (-{total_removed:.2f} minutes)"
                )

            self.save()
            return total_removed
        except Exception as e:
            self.logger.error(f"Erreur lors de la synchronisation des vidéos: {str(e)}")
            return 0

    def add_video_to_stats(self, video: Dict):
        """Ajoute une vidéo aux statistiques."""
        try:
            video_id = video.get("id")
            if not video_id:
                return

            # Mettre à jour le compteur total
            self.stats["total_videos"] = self.stats.get("total_videos", 0) + 1

            # Calculer la durée
            minutes = 0
            duration = None
            try:
                if "contentDetails" in video and "duration" in video["contentDetails"]:
                    duration = video["contentDetails"]["duration"]
                elif "duration" in video:
                    duration = video["duration"]

                if duration:
                    duration_obj = parse_duration(duration)
                    minutes = duration_obj.total_seconds() / 60
                    self.logger.info(f"Durée analysée: {duration} -> {minutes} minutes")

            except Exception as e:
                self.logger.error(f"Erreur lors du calcul de la durée: {str(e)}")
                minutes = 0

            # Enregistrer la vidéo dans le suivi
            self.stats["tracked_videos"] = self.stats.get("tracked_videos", {})
            self.stats["tracked_videos"][video_id] = {
                "duration": round(minutes, 2),
                "added_at": datetime.now().isoformat(),
                "title": video.get("title", "Sans titre"),
            }

            # S'assurer que total_watch_time existe
            if "total_watch_time" not in self.stats:
                self.stats["total_watch_time"] = 0

            # Mettre à jour le temps total
            current_total = self.stats["total_watch_time"]
            self.stats["total_watch_time"] = current_total + minutes

            # Mettre à jour les statistiques mensuelles
            month_key = datetime.now().strftime("%Y-%m")
            if month_key not in self.stats["videos_by_month"]:
                self.stats["videos_by_month"][month_key] = {"count": 0, "watch_time": 0}
            self.stats["videos_by_month"][month_key]["count"] += 1
            self.stats["videos_by_month"][month_key]["watch_time"] += minutes

            # Mettre à jour les statistiques quotidiennes
            today = datetime.now().strftime("%Y-%m-%d")
            if today not in self.stats["daily_stats"]:
                self.stats["daily_stats"][today] = {"videos_added": 0, "watch_time": 0}
            self.stats["daily_stats"][today]["videos_added"] += 1
            self.stats["daily_stats"][today]["watch_time"] += minutes

            # Ajouter à l'historique
            video_info = {
                "id": video_id,
                "title": video.get("title", "Sans titre"),
                "duration": duration if duration else "PT0S",
                "watch_time": minutes,
                "added_at": datetime.now().isoformat(),
            }

            # S'assurer que video_history existe
            if "video_history" not in self.stats:
                self.stats["video_history"] = []

            self.stats["video_history"].insert(0, video_info)
            self.stats["video_history"] = self.stats["video_history"][:100]

            # Mettre à jour la dernière vérification
            self.stats["last_check"] = datetime.now().isoformat()

            # Recalculer le temps total à partir des vidéos suivies
            tracked_total = sum(
                v["duration"] for v in self.stats["tracked_videos"].values()
            )
            self.stats["total_watch_time"] = round(tracked_total, 2)

            self.save()
            self.logger.info(
                f"Vidéo {video_id} ajoutée aux statistiques. Durée: {minutes:.2f} minutes. "
                f"Total: {self.stats['total_watch_time']:.2f} minutes"
            )

        except Exception as e:
            self.logger.error(
                f"Erreur lors de l'ajout des statistiques de la vidéo: {str(e)}"
            )

    def update_video_count(self):
        """Met à jour le nombre de vidéos basé sur le fichier tracked_videos.json."""
        try:
            # Compter les vidéos depuis le tracker
            if hasattr(self.automation, "video_tracker"):
                video_count = len(self.automation.video_tracker.videos)
            else:
                video_count = 0

            self.stats["total_videos"] = video_count

            # Mettre à jour les statistiques quotidiennes
            today = datetime.now().strftime("%Y-%m-%d")
            if today not in self.stats["daily_stats"]:
                self.stats["daily_stats"][today] = {"videos_added": 0, "watch_time": 0}

            self.save()
            self.logger.info(f"Nombre de vidéos mis à jour: {video_count}")
            return video_count
        except Exception as e:
            self.logger.error(
                f"Erreur lors de la mise à jour du nombre de vidéos: {str(e)}"
            )
            return 0

    def update_video_count(self, change: int = -1):
        """Met à jour le compteur de vidéos."""
        try:
            self.stats["total_videos"] = max(
                0, self.stats.get("total_videos", 0) + change
            )

            # Mettre à jour les statistiques quotidiennes
            today = datetime.now().strftime("%Y-%m-%d")
            if today not in self.stats["daily_stats"]:
                self.stats["daily_stats"][today] = {"videos_added": 0, "watch_time": 0}

            if change < 0:  # Si on supprime une vidéo
                self.stats["daily_stats"][today]["videos_added"] = max(
                    0, self.stats["daily_stats"][today].get("videos_added", 0) - 1
                )

            self.save()
            self.logger.info(
                f"Nombre total de vidéos mis à jour: {self.stats['total_videos']}"
            )
        except Exception as e:
            self.logger.error(
                f"Erreur lors de la mise à jour du nombre de vidéos: {str(e)}"
            )

    def update_total_watch_time(self, new_total: float = None):
        """Met à jour le temps total de visionnage."""
        try:
            if (
                new_total is None
                and hasattr(self, "automation")
                and hasattr(self.automation, "video_tracker")
            ):
                new_total = self.automation.video_tracker.calculate_total_duration()

            self.stats["total_watch_time"] = round(float(new_total), 2)

            # Mettre à jour aussi les statistiques quotidiennes
            today = datetime.now().strftime("%Y-%m-%d")
            if today in self.stats["daily_stats"]:
                self.stats["daily_stats"][today]["watch_time"] = self.stats[
                    "total_watch_time"
                ]

            self.save()
            self.logger.info(
                f"Temps de visionnage total mis à jour: {self.stats['total_watch_time']:.2f} minutes"
            )
        except Exception as e:
            self.logger.error(f"Erreur lors de la mise à jour du temps total: {str(e)}")

    def reset_watch_time(self):
        """Réinitialise le temps de visionnage."""
        try:
            # Réinitialiser le temps total
            self.stats["total_watch_time"] = 0

            # Réinitialiser le temps du mois en cours
            month_key = datetime.now().strftime("%Y-%m")
            if month_key in self.stats["videos_by_month"]:
                self.stats["videos_by_month"][month_key]["watch_time"] = 0

            # Réinitialiser le temps du jour
            today = datetime.now().strftime("%Y-%m-%d")
            if today in self.stats["daily_stats"]:
                self.stats["daily_stats"][today]["watch_time"] = 0

            self.save()
            self.logger.info("Temps de visionnage réinitialisé")

        except Exception as e:
            self.logger.error(f"Erreur lors de la réinitialisation du temps: {str(e)}")

    def update_quota(self, used: int, limit: int, last_reset: str):
        """Met à jour l'utilisation du quota API."""
        self.stats["quota_usage"] = {
            "used": used,
            "limit": limit,
            "last_reset": last_reset,
            "next_reset": (
                datetime.fromisoformat(last_reset) + timedelta(days=1)
            ).isoformat(),
        }
        self.save()

    def update_selected_channels_count(self, count: int):
        """Met à jour le nombre de chaînes sélectionnées."""
        self.stats["selected_channels"] = count
        self.save()

    def get_current_stats(self) -> Dict:
        """Récupère les statistiques actuelles."""
        try:
            # Calculer le temps total depuis le tracker
            total_time = 0
            video_count = 0

            if self.automation and hasattr(self.automation, "video_tracker"):
                try:
                    total_time = (
                        self.automation.video_tracker.calculate_total_duration()
                    )
                    video_count = len(self.automation.video_tracker.videos)
                    self.logger.info(
                        f"Stats depuis tracker: {video_count} vidéos, {total_time:.2f} minutes"
                    )
                except Exception as e:
                    self.logger.error(
                        f"Erreur lors du calcul depuis le tracker: {str(e)}"
                    )

            if total_time == 0:
                total_time = self.stats.get("total_watch_time", 0)
            if video_count == 0:
                video_count = self.stats.get("total_videos", 0)

            today = datetime.now().strftime("%Y-%m-%d")
            current_month = datetime.now().strftime("%Y-%m")

            return {
                "total_videos": video_count,
                "total_watch_time": round(total_time, 2),
                "videos_today": self.stats.get("daily_stats", {})
                .get(today, {})
                .get("videos_added", 0),
                "watch_time_today": self.stats.get("daily_stats", {})
                .get(today, {})
                .get("watch_time", 0),
                "videos_this_month": self.stats.get("videos_by_month", {})
                .get(current_month, {})
                .get("count", 0),
                "selected_channels": self.stats.get("selected_channels", 0),
                "quota_usage": self.stats.get("quota_usage", {}),
                "last_check": self.stats.get("last_check", ""),
            }
        except Exception as e:
            self.logger.error(f"Erreur dans get_current_stats: {str(e)}")
            return {
                "total_videos": 0,
                "total_watch_time": 0,
                "videos_today": 0,
                "watch_time_today": 0,
                "videos_this_month": 0,
                "selected_channels": 0,
                "quota_usage": {},
                "last_check": "",
            }

    def update_channel_counts(self):
        """Met à jour les compteurs de chaînes."""
        try:
            if hasattr(self, "automation"):
                # Mettre à jour le nombre de chaînes totales
                total_channels = (
                    len(self.automation.subscriptions)
                    if hasattr(self.automation, "subscriptions")
                    else 0
                )

                # Mettre à jour le nombre de chaînes sélectionnées
                selected_channels = len(self.automation.get_selected_channels())

                # Sauvegarder dans les stats
                self.stats["total_channels"] = total_channels
                self.stats["selected_channels"] = selected_channels

                self.logger.info(
                    f"Compteurs de chaînes mis à jour: {total_channels} totales, {selected_channels} sélectionnées"
                )
                self.save()

                return {
                    "total_channels": total_channels,
                    "selected_channels": selected_channels,
                }
        except Exception as e:
            self.logger.error(
                f"Erreur lors de la mise à jour des compteurs de chaînes: {str(e)}"
            )
            return {"total_channels": 0, "selected_channels": 0}

    def sync_with_tracker(self):
        """Synchronise les statistiques avec le video tracker."""
        try:
            if self.automation and hasattr(self.automation, "video_tracker"):
                total_time = self.automation.video_tracker.calculate_total_duration()
                video_count = len(self.automation.video_tracker.videos)

                self.stats["total_watch_time"] = total_time
                self.stats["total_videos"] = video_count

                self.logger.info(
                    f"Synchronisation avec tracker: {video_count} vidéos, "
                    f"{total_time:.2f} minutes"
                )
                self.save()
        except Exception as e:
            self.logger.error(
                f"Erreur lors de la synchronisation avec le tracker: {str(e)}"
            )

    def get_daily_stats(self, days: int = 7) -> List[Dict]:
        """Récupère les statistiques quotidiennes des n derniers jours."""
        stats = []
        now = datetime.now()

        for i in range(days):
            date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            if date in self.stats["daily_stats"]:
                stats.append(
                    {
                        "date": date,
                        "videos": self.stats["daily_stats"][date]["videos_added"],
                        "watch_time": round(
                            self.stats["daily_stats"][date]["watch_time"]
                        ),
                    }
                )
            else:
                stats.append({"date": date, "videos": 0, "watch_time": 0})

        return sorted(stats, key=lambda x: x["date"])

    def get_video_history(self, limit: int = 100) -> List[Dict]:
        """Récupère l'historique des dernières vidéos ajoutées."""
        return self.stats["video_history"][:limit]

    def get_last_check_time(self) -> str:
        """Récupère la date de dernière vérification."""
        return self.stats["last_check"]

    def cleanup_old_stats(self, days: int = 30):
        """Nettoie les anciennes statistiques."""
        cutoff_date = datetime.now() - timedelta(days=days)

        # Nettoyer les stats quotidiennes
        self.stats["daily_stats"] = {
            date: stats
            for date, stats in self.stats["daily_stats"].items()
            if datetime.strptime(date, "%Y-%m-%d") >= cutoff_date
        }

        # Nettoyer les stats mensuelles (garder les 12 derniers mois)
        months = sorted(self.stats["videos_by_month"].keys(), reverse=True)
        if len(months) > 12:
            for month in months[12:]:
                del self.stats["videos_by_month"][month]

        self.save()

    def reset_daily_stats(self):
        """Réinitialise les statistiques quotidiennes."""
        today = datetime.now().strftime("%Y-%m-%d")
        if today in self.stats["daily_stats"]:
            self.stats["daily_stats"][today] = {"videos_added": 0, "watch_time": 0}
        self.save()
