import os
import json
import traceback
from flask import Flask, render_template, jsonify, request, abort, send_from_directory
from youtube_automation import YouTubeWatchLaterAutomation
from config import Config, active_config
import threading
import logging
from datetime import datetime
import re
from functools import wraps
import time
from utils.logger import LoggerSetup
from utils.decorators import handle_ssl_error
from config import Config
import isodate
from datetime import datetime, timedelta
from utils import format_duration_readable


# Initialisation de l'application Flask
app = Flask(__name__)
app.config.from_object(active_config)
Config.init_app(app)

# Création des dossiers nécessaires
os.makedirs(os.path.join(app.root_path, "static", "images"), exist_ok=True)
os.makedirs(Config.DATA_DIR, exist_ok=True)
os.makedirs(os.path.dirname(Config.SELECTED_CHANNELS_FILE), exist_ok=True)
os.makedirs(os.path.dirname(Config.VIDEOS_TRACKING_FILE), exist_ok=True)

# Configuration du logging
logger = LoggerSetup.setup(
    log_file=Config.LOG_FILE, level=getattr(logging, app.config["LOG_LEVEL"])
)

# Initialisation de l'automation YouTube
automation = YouTubeWatchLaterAutomation(app.config["YOUTUBE_API_KEY"])
monitoring_thread = None
is_monitoring = False

# Cache simple pour les requêtes fréquentes
cache = {}


# Ajout du décorateur SSL ici
def handle_ssl_error(func):
    """Décorateur pour gérer les erreurs SSL avec retries."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:  # Plus général pour attraper toutes les erreurs SSL
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Erreur SSL (tentative {attempt + 1}/{max_retries}): {str(e)}"
                    )
                    time.sleep(retry_delay * (attempt + 1))
                    try:
                        if hasattr(args[0], "authenticate"):
                            args[0].authenticate()
                    except:
                        pass
                else:
                    raise
        return func(*args, **kwargs)

    return wrapper


# Initialisation de l'application Flask
app = Flask(__name__)
app.config.from_object(active_config)
Config.init_app(app)


def init_check_hours_file():
    try:
        os.makedirs(os.path.dirname(Config.CHECK_HOURS_FILE), exist_ok=True)
        if not os.path.exists(Config.CHECK_HOURS_FILE):
            initial_data = {
                "check_times": [],
                "last_updated": datetime.now().isoformat(),
            }
            with open(Config.CHECK_HOURS_FILE, "w", encoding="utf-8") as f:
                json.dump(initial_data, f, indent=2)
            logger.info("Fichier check_hours.json créé avec succès")
        else:
            # Vérifier que le fichier est valide
            try:
                with open(Config.CHECK_HOURS_FILE, "r", encoding="utf-8") as f:
                    json.load(f)
            except json.JSONDecodeError:
                logger.warning("Fichier JSON invalide, recréation...")
                initial_data = {
                    "check_times": [],
                    "last_updated": datetime.now().isoformat(),
                }
                with open(Config.CHECK_HOURS_FILE, "w", encoding="utf-8") as f:
                    json.dump(initial_data, f, indent=2)
    except Exception as e:
        logger.error(
            f"Erreur lors de l'initialisation du fichier check_hours.json: {str(e)}"
        )


# Appeler la fonction d'initialisation
init_check_hours_file()


def cache_response(duration=300):
    """Décorateur pour mettre en cache les réponses des routes."""

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            cache_key = f.__name__ + str(args) + str(kwargs)
            now = time.time()

            if cache_key in cache and cache[cache_key]["expires"] > now:
                return cache[cache_key]["data"]

            result = f(*args, **kwargs)
            cache[cache_key] = {"data": result, "expires": now + duration}
            return result

        return wrapper

    return decorator


def require_auth(f):
    """Décorateur pour vérifier l'authentification."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not automation.youtube:
            try:
                automation.authenticate()
            except Exception as e:
                logger.error(f"Erreur d'authentification: {str(e)}")
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": Config.get_error_message("auth_failed"),
                        }
                    ),
                    401,
                )
        return f(*args, **kwargs)

    return decorated_function


@app.route("/get_watch_time")
@require_auth
def get_watch_time():
    try:
        total_time = automation.video_tracker.calculate_total_duration()
        video_count = len(automation.video_tracker.videos)
        logger.info(
            f"Temps de visionnage calculé depuis tracked_videos.json: {format_duration_readable(total_time)}"
        )
        logger.info(f"Nombre de vidéos: {video_count}")
        return jsonify(
            {
                "success": True,
                "watch_time": format_duration_readable(total_time),
                "video_count": video_count,
            }
        )
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du temps de visionnage: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/remove_from_watch_later", methods=["POST"])
@require_auth
def remove_from_watch_later():
    try:
        data = request.get_json()
        if not data or "video_id" not in data:
            return jsonify({"success": False, "error": "ID de vidéo requis"}), 400

        result = automation.remove_from_watch_later(data["video_id"])

        if result["success"]:
            # Obtenir les stats mises à jour
            stats = automation.statistics_manager.get_current_stats()
            total_time = automation.video_tracker.calculate_total_duration()
            video_count = len(automation.video_tracker.videos)

            return jsonify(
                {
                    "success": True,
                    "message": result["message"],
                    "new_total_time": total_time,
                    "new_video_count": video_count,
                    "removed_duration": result.get("removed_duration", 0),
                    "tracker_duration": result.get("tracker_duration", 0),
                    "api_duration": result.get("api_duration", 0),
                }
            )

        return jsonify(result)

    except Exception as e:
        logger.error(f"Erreur lors du retrait de la vidéo: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_tracked_videos")
@require_auth
def get_tracked_videos():
    try:
        tracked_videos = automation.statistics_manager.stats.get("tracked_videos", {})
        return jsonify({"success": True, "videos": tracked_videos})
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des vidéos suivies: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/static/js/<path:filename>")
def serve_js(filename):
    return send_from_directory("static/js", filename)


@app.route("/get_watch_later_videos")
@require_auth
def get_watch_later_videos():
    """Récupère les vidéos de la playlist Watch Later."""
    try:
        logger.info("Récupération des vidéos Watch Later...")
        videos = automation.get_watch_later_videos()
        return jsonify({"success": True, "videos": videos})
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des vidéos Watch Later: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/static/css/<path:filename>")
def serve_css(filename):
    return send_from_directory("static/css", filename)


@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory("static", path)


@app.route("/favicon.ico")
def favicon():
    """Gestion du favicon"""
    try:
        root_dir = os.path.dirname(os.path.abspath(__file__))
        return send_from_directory(
            os.path.join(root_dir, "static", "images"),
            "favicon.ico",
            mimetype="image/vnd.microsoft.icon",
        )
    except Exception as e:
        logger.error(f"Erreur lors du chargement du favicon: {str(e)}")
        return "", 404  # Retourne une réponse vide avec code 404

        # Formater les données
        formatted_subs = []
        for sub in subscriptions:
            try:
                formatted_sub = {
                    "id": sub["id"],
                    "title": sub["title"],
                    "thumbnail": sub.get("thumbnail", ""),
                    "description": sub.get("description", ""),
                    "subscriberCount": int(sub.get("subscriberCount", 0)),
                    "videoCount": int(sub.get("videoCount", 0)),
                    "selected": sub["id"] in selected_channels,
                    "channelTitle": sub.get("title", "Chaîne inconnue"),  # Important
                }
                formatted_subs.append(formatted_sub)
            except Exception as e:
                logger.warning(f"Erreur lors du formatage de l'abonnement: {str(e)}")
                continue

        logger.info(f"{len(formatted_subs)} abonnements formatés")
        return jsonify(
            {
                "success": True,
                "subscriptions": formatted_subs,
                "is_monitoring": automation.get_monitoring_status()["is_monitoring"],
                "total_count": len(formatted_subs),
            }
        )

    except Exception as e:
        logger.error(f"Erreur lors de la récupération des abonnements: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/subscribe_to_updates")
def subscribe_to_updates():
    def generate():
        while True:
            status = automation.get_monitoring_status()
            quota = automation.get_quota_status()
            data = {"status": status, "quota": quota, "is_monitoring": is_monitoring}
            yield f"data: {json.dumps(data)}\n\n"
            time.sleep(5)

    return Response(generate(), mimetype="text/event-stream")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/get_subscriptions")
@require_auth
def get_subscriptions():
    """Récupère la liste des abonnements."""
    try:
        logger.info("Récupération des abonnements...")
        automation.is_loading_subscriptions = (
            True  # Indiquer que le chargement commence
        )

        subscriptions = automation.get_subscriptions()

        automation.is_loading_subscriptions = (
            False  # Indiquer que le chargement est terminé
        )

        # Une fois les chaînes chargées, mettre à jour le quota
        quota_status = automation.get_quota_status()

        return jsonify(
            {
                "success": True,
                "subscriptions": subscriptions,
                "is_monitoring": automation.get_monitoring_status()["is_monitoring"],
                "total_count": len(subscriptions),
                "quota_status": quota_status,
            }
        )

    except Exception as e:
        automation.is_loading_subscriptions = False
        logger.error(f"Erreur lors de la récupération des abonnements: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_statistics")
@require_auth
def get_statistics():
    try:
        stats = automation.statistics_manager.get_current_stats()

        # Obtenir le nombre réel de chaînes depuis le cache
        total_channels = 0
        cache_file = "cached_subscriptions.json"
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    subscriptions = json.load(f)
                    total_channels = len(subscriptions)
            except Exception as e:
                logger.error(f"Erreur lors de la lecture du cache: {str(e)}")

        # Si pas de cache, utiliser le nombre de chaînes en mémoire
        if total_channels == 0 and hasattr(automation, "subscriptions"):
            total_channels = len(automation.subscriptions)

        # Mettre à jour les statistiques
        if hasattr(automation, "statistics_manager"):
            automation.statistics_manager.stats["total_channels"] = total_channels
            automation.statistics_manager.save()

        # Mettre à jour le total dans la réponse
        stats["total_channels"] = total_channels

        logger.info(f"Nombre total de chaînes : {total_channels}")
        return jsonify({"success": True, "statistics": stats})
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des statistiques: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_latest_videos")
@require_auth
def get_latest_videos():
    """Récupère les dernières vidéos."""
    try:
        logger.info("Récupération des dernières vidéos...")
        # Lire les chaînes sélectionnées
        try:
            with open(Config.SELECTED_CHANNELS_FILE, "r", encoding="utf-8") as f:
                selected_channel_ids = [line.strip() for line in f]
        except FileNotFoundError:
            selected_channel_ids = []
            logger.warning("Aucune chaîne sélectionnée trouvée")

        if not selected_channel_ids:
            return jsonify({"success": True, "videos": []})

        latest_videos = []
        max_videos_per_channel = min(
            Config.MAX_VIDEOS_PER_CHANNEL,
            Config.MAX_RECENT_VIDEOS // len(selected_channel_ids),
        )

        for channel_id in selected_channel_ids:
            try:
                # Obtenir les informations de la chaîne
                channel_request = automation.youtube.channels().list(
                    part="snippet,contentDetails", id=channel_id
                )
                channel_response = channel_request.execute()

                if not channel_response["items"]:
                    continue

                channel = channel_response["items"][0]
                playlist_id = channel["contentDetails"]["relatedPlaylists"]["uploads"]

                # Récupérer les vidéos récentes
                videos = automation.get_recent_videos(
                    playlist_id=playlist_id, max_results=max_videos_per_channel
                )

                latest_videos.extend(videos)
                time.sleep(Config.API_QUOTA_DELAY)  # Respecter les quotas

            except Exception as e:
                logger.error(f"Erreur pour la chaîne {channel_id}: {str(e)}")
                continue

        # Trier par date de publication
        latest_videos.sort(key=lambda x: x["publishedAt"], reverse=True)

        # Limiter le nombre total de vidéos
        latest_videos = latest_videos[: Config.MAX_RECENT_VIDEOS]

        logger.info(f"{len(latest_videos)} vidéos récupérées")
        return jsonify({"success": True, "videos": latest_videos})

    except Exception as e:
        logger.error(f"Erreur lors de la récupération des vidéos: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/check_watched_videos")
@require_auth
def check_watched_videos():
    """Vérifie et retire les vidéos déjà regardées."""
    try:
        # Afficher un log de début avec plus de détails
        logger.info("Début de la vérification des vidéos regardées")

        try:
            # Vérifier que la playlist existe
            if not automation.watch_later_playlist_id:
                raise ValueError("Playlist Watch Later non initialisée")

            # Vérifier le quota avant de commencer
            quota_status = automation.get_quota_status()
            if quota_status["percentage_used"] > 95:
                raise QuotaExceededError("Quota API YouTube presque épuisé")

            # Obtenir les statistiques initiales
            initial_stats = automation.statistics_manager.get_current_stats()
            initial_count = initial_stats.get("total_videos", 0)
            initial_time = initial_stats.get("total_watch_time", 0)

            # Effectuer la vérification des vidéos regardées
            videos_removed = automation.check_watched_videos()

            # Obtenir les nouvelles statistiques
            new_stats = automation.statistics_manager.get_current_stats()
            new_count = new_stats.get("total_videos", 0)
            new_time = new_stats.get("total_watch_time", 0)

            # Calculer les changements
            videos_difference = initial_count - new_count
            time_difference = initial_time - new_time

            # Log détaillé des résultats
            logger.info(f"Vidéos retirées: {videos_removed}")
            logger.info(f"Changement du total de vidéos: {videos_difference}")
            logger.info(f"Changement du temps total: {time_difference:.2f} minutes")
            logger.info(f"Nouvelles statistiques: {new_stats}")

            # Forcer une synchronisation complète
            automation.statistics_manager.sync_with_tracker()
            automation.video_tracker._save_videos()

            return jsonify(
                {
                    "success": True,
                    "message": f"{videos_removed} vidéos retirées",
                    "details": {
                        "removed_count": videos_removed,
                        "stats": {
                            "previous": {
                                "total_videos": initial_count,
                                "total_watch_time": initial_time,
                            },
                            "current": {
                                "total_videos": new_count,
                                "total_watch_time": new_time,
                            },
                            "changes": {
                                "videos_removed": videos_difference,
                                "time_saved": round(time_difference, 2),
                            },
                        },
                        "quota_info": automation.get_quota_status(),
                        "timestamp": datetime.now().isoformat(),
                    },
                }
            )

        except QuotaExceededError as e:
            logger.warning(f"Quota dépassé: {str(e)}")
            return (
                jsonify(
                    {"success": False, "error": "Quota API dépassé", "details": str(e)}
                ),
                429,
            )  # Too Many Requests

        except ValueError as e:
            logger.error(f"Erreur de validation: {str(e)}")
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Erreur de configuration",
                        "details": str(e),
                    }
                ),
                400,
            )  # Bad Request

        except Exception as e:
            logger.error(f"Erreur lors de la vérification: {str(e)}")
            logger.exception(e)  # Log complet de l'erreur
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Erreur lors de la vérification",
                        "details": str(e),
                    }
                ),
                500,
            )  # Internal Server Error

    finally:
        try:
            # Toujours essayer de synchroniser l'état final
            automation.statistics_manager.sync_with_tracker()
            automation.video_tracker._save_videos()
        except Exception as e:
            logger.error(f"Erreur lors de la synchronisation finale: {str(e)}")


@app.route("/refresh_channels")
@require_auth
def refresh_channels():
    """Force le rafraîchissement des abonnements."""
    try:
        # Supprimer le cache existant
        cache_file = "cached_subscriptions.json"
        if os.path.exists(cache_file):
            os.remove(cache_file)

        # Récupérer les chaînes
        subscriptions = automation.get_subscriptions()

        return jsonify(
            {
                "success": True,
                "subscriptions": subscriptions,
                "message": "Chaînes actualisées",
            }
        )
    except Exception as e:
        logger.error(f"Erreur lors du rafraîchissement des chaînes: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_recent_videos/<channel_id>")
@require_auth
def get_recent_videos(channel_id):
    """Récupère les vidéos récentes d'une chaîne spécifique en excluant les Shorts."""
    try:
        logger.info(f"Récupération des vidéos pour la chaîne {channel_id}")

        # Vérifier que l'ID de la chaîne est valide
        channel_request = automation.youtube.channels().list(
            part="contentDetails", id=channel_id
        )
        channel_response = channel_request.execute()

        if not channel_response["items"]:
            raise ValueError(Config.get_error_message("invalid_channel"))

        playlist_id = channel_response["items"][0]["contentDetails"][
            "relatedPlaylists"
        ]["uploads"]

        # Obtenir toutes les vidéos récentes
        request = automation.youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=Config.MAX_VIDEOS_PER_CHANNEL,
        )
        response = request.execute()
        automation._update_quota(cost=1)

        videos = []
        for item in response.get("items", []):
            video_id = item["snippet"]["resourceId"]["videoId"]

            # Vérifier les détails de la vidéo pour identifier les Shorts
            video_request = automation.youtube.videos().list(
                part="snippet,contentDetails,statistics", id=video_id
            )
            video_response = video_request.execute()
            automation._update_quota(cost=1)

            if not video_response["items"]:
                continue

            video = video_response["items"][0]

            # Vérifier si c'est un Short en examinant l'URL de la vidéo
            try:
                # Récupérer l'URL canonique de la vidéo
                video_url = f"https://www.youtube.com/watch?v={video_id}"
                snippet = video["snippet"]
                if (
                    "shorts" in video.get("snippet", {}).get("customUrl", "").lower()
                    or "shorts" in snippet.get("description", "").lower()
                ):
                    continue

                # Ignorer les vidéos au format vertical et de courte durée
                duration = video["contentDetails"]["duration"]
                duration_seconds = isodate.parse_duration(duration).total_seconds()

                if duration_seconds <= 61:  # Ignorer les vidéos de moins de 61 secondes
                    continue

                # Ajouter la vidéo si ce n'est pas un Short
                videos.append(
                    {
                        "id": video_id,
                        "title": item["snippet"]["title"],
                        "description": item["snippet"]["description"],
                        "publishedAt": item["snippet"]["publishedAt"],
                        "thumbnail": item["snippet"]["thumbnails"]
                        .get("medium", {})
                        .get("url"),
                        "channelTitle": item["snippet"]["channelTitle"],
                        "duration": duration,
                        "viewCount": video["statistics"].get("viewCount", "0"),
                        "likeCount": video["statistics"].get("likeCount", "0"),
                    }
                )

            except Exception as e:
                logger.warning(
                    f"Erreur lors du traitement de la vidéo {video_id}: {str(e)}"
                )
                continue

        logger.info(f"{len(videos)} vidéos récupérées pour la chaîne {channel_id}")
        return jsonify({"success": True, "videos": videos})

    except ValueError as e:
        logger.warning(f"Chaîne invalide {channel_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des vidéos: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/add_to_watch_later", methods=["POST"])
@require_auth
def add_to_watch_later_route():
    """Ajoute une vidéo à la playlist Watch Later."""
    try:
        data = request.get_json()
        if not data or "video_id" not in data or "title" not in data:
            return (
                jsonify({"success": False, "error": "ID de vidéo et titre requis"}),
                400,
            )

        video_id = data["video_id"]
        title = data["title"]

        result = automation.add_to_watch_later(video_id, title)

        # Si c'est un Short, retourner un message d'erreur 400 (Bad Request) au lieu de 500
        if not result.get("success") and "Short" in result.get("message", ""):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": result.get(
                            "message",
                            "Les Shorts ne peuvent pas être ajoutés à la playlist",
                        ),
                    }
                ),
                400,
            )

        if result.get("success"):
            return jsonify({"success": True, "message": "Vidéo ajoutée avec succès"})
        else:
            return (
                jsonify(
                    {"success": False, "error": result.get("error", "Erreur inconnue")}
                ),
                500,
            )

    except Exception as e:
        logger.error(f"Erreur lors de l'ajout à Watch Later: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_quota_status")
@require_auth
def get_quota_status():
    """Récupère le statut actuel du quota API."""
    try:
        # Vérifier si nous sommes en train de charger les chaînes
        if (
            hasattr(automation, "is_loading_subscriptions")
            and automation.is_loading_subscriptions
        ):
            return jsonify(
                {
                    "success": True,
                    "quota": {
                        "message": "Chargement des chaînes en cours...",
                        "loading": True,
                    },
                }
            )

        quota_status = automation.get_quota_status()
        return jsonify({"success": True, "quota": quota_status})
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du statut du quota: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/save_channels", methods=["POST"])
@require_auth
def save_channels():
    try:
        data = request.get_json()
        if not isinstance(data, dict) or "channel_ids" not in data:
            logger.error("Format de données invalide")
            return (
                jsonify({"success": False, "error": "Format de données invalide"}),
                400,
            )

        channel_ids = data["channel_ids"]
        if not isinstance(channel_ids, list):
            logger.error("La liste des chaînes est invalide")
            return (
                jsonify(
                    {"success": False, "error": "La liste des chaînes est invalide"}
                ),
                400,
            )

        # Sauvegarder les chaînes et recevoir le résultat
        result = automation.save_selected_channels(channel_ids)

        if result["success"]:
            logger.info(f"{len(channel_ids)} chaînes sauvegardées")

            # On retourne directement le résultat qui contient déjà les stats
            return jsonify(result)

        else:
            raise Exception("Échec de la sauvegarde")

    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde des chaînes: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_selected_channels")
@require_auth
def get_selected_channels():
    try:
        selected_channels = automation.get_selected_channels()
        return jsonify({"success": True, "channel_ids": selected_channels})
    except Exception as e:
        logger.error(
            f"Erreur lors de la récupération des chaînes sélectionnées: {str(e)}"
        )
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/start_monitoring")
@require_auth
def start_monitoring():
    """Démarre la surveillance des chaînes."""
    try:
        # Récupérer la période de vérification
        check_period = request.args.get("check_period", "12h")

        logger.info(
            f"Démarrage de la surveillance avec période de vérification: {check_period}"
        )

        # Arrêter la surveillance existante si nécessaire
        if automation.is_monitoring:
            automation.stop_monitoring()
            time.sleep(1)  # Petit délai pour s'assurer que tout est arrêté

        # Définir la nouvelle période et démarrer
        automation.check_period = check_period

        if automation.start_monitoring():
            return jsonify(
                {
                    "success": True,
                    "message": f"Surveillance démarrée (vidéos publiées < {check_period})",
                }
            )
        else:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Erreur lors du démarrage de la surveillance",
                    }
                ),
                400,
            )

    except Exception as e:
        logger.error(f"Erreur lors du démarrage de la surveillance: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/stop_monitoring")
@require_auth
def stop_monitoring():
    """Arrête la surveillance."""
    try:
        if automation.stop_monitoring_process():  # Utiliser la nouvelle méthode
            return jsonify({"success": True, "message": "Surveillance arrêtée"})
        return (
            jsonify(
                {"success": False, "error": "Erreur lors de l'arrêt de la surveillance"}
            ),
            500,
        )
    except Exception as e:
        logger.error(f"Erreur lors de l'arrêt de la surveillance: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/debug/subscriptions")
@require_auth
def debug_subscriptions():
    """Route de débogage pour vérifier les abonnements."""
    try:
        logger.info("Tentative de récupération des abonnements pour debug")
        subs = automation.get_subscriptions()
        logger.info(f"Nombre d'abonnements trouvés: {len(subs)}")

        debug_info = {
            "success": True,
            "subscriptions_count": len(subs),
            "first_subscription": subs[0] if subs else None,
            "youtube_client_initialized": bool(automation.youtube),
            "auth_status": (
                "authenticated" if automation.youtube else "not_authenticated"
            ),
            "quota_status": (
                automation.get_quota_status()
                if hasattr(automation, "get_quota_status")
                else None
            ),
            "error": None,
        }

        logger.info(f"Informations de débogage: {debug_info}")
        return jsonify(debug_info)

    except Exception as e:
        logger.error(f"Erreur de débogage: {str(e)}")
        error_info = {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        }
        return jsonify(error_info), 500


@app.route("/debug/auth_status")
def debug_auth_status():
    """Vérifie le statut de l'authentification."""
    try:
        return jsonify(
            {
                "success": True,
                "is_authenticated": bool(automation.youtube),
                "credentials_exist": os.path.exists(Config.TOKEN_PICKLE_FILE),
                "client_secrets_exist": os.path.exists(Config.CLIENT_SECRETS_FILE),
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/debug/quota")
@require_auth
def debug_quota():
    """Vérifie le statut du quota API."""
    try:
        quota_status = automation.get_quota_status()
        return jsonify({"success": True, "quota": quota_status})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/debug/check_files")
def debug_check_files():
    """Vérifie l'existence et les permissions des fichiers importants."""
    files_status = {
        "token_pickle": {
            "exists": os.path.exists(Config.TOKEN_PICKLE_FILE),
            "readable": (
                os.access(Config.TOKEN_PICKLE_FILE, os.R_OK)
                if os.path.exists(Config.TOKEN_PICKLE_FILE)
                else False
            ),
            "writable": (
                os.access(Config.TOKEN_PICKLE_FILE, os.W_OK)
                if os.path.exists(Config.TOKEN_PICKLE_FILE)
                else False
            ),
        },
        "client_secrets": {
            "exists": os.path.exists(Config.CLIENT_SECRETS_FILE),
            "readable": (
                os.access(Config.CLIENT_SECRETS_FILE, os.R_OK)
                if os.path.exists(Config.CLIENT_SECRETS_FILE)
                else False
            ),
        },
        "selected_channels": {
            "exists": os.path.exists(Config.SELECTED_CHANNELS_FILE),
            "readable": (
                os.access(Config.SELECTED_CHANNELS_FILE, os.R_OK)
                if os.path.exists(Config.SELECTED_CHANNELS_FILE)
                else False
            ),
            "writable": (
                os.access(Config.SELECTED_CHANNELS_FILE, os.W_OK)
                if os.path.exists(Config.SELECTED_CHANNELS_FILE)
                else False
            ),
        },
    }
    return jsonify({"success": True, "files": files_status})


@app.route("/update_check_hours", methods=["POST"])
@require_auth
def update_check_hours():
    """Met à jour les horaires de vérification."""
    try:
        data = request.get_json()
        logger.info(f"Données reçues: {data}")

        # Vérifier la présence des données
        if not data or "times" not in data:
            logger.error("Données manquantes dans la requête")
            return (
                jsonify({"success": False, "error": "Format de données invalide"}),
                400,
            )

        # Vérifier le type des données
        times = data["times"]
        if not isinstance(times, list):
            logger.error(f"Format invalide des temps : {type(times)}")
            return (
                jsonify(
                    {"success": False, "error": "Les temps doivent être une liste"}
                ),
                400,
            )

        # Convertir et valider les horaires
        validated_times = []
        for time_str in times:
            try:
                if not isinstance(time_str, str):
                    raise ValueError(f"Format d'heure invalide: {time_str}")

                if not re.match(r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$", time_str):
                    raise ValueError(f"Format d'heure invalide: {time_str}")

                hours, minutes = map(int, time_str.split(":"))
                minutes_since_midnight = hours * 60 + minutes
                validated_times.append(minutes_since_midnight)

            except Exception as e:
                logger.error(f"Erreur de validation pour {time_str}: {str(e)}")
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f"Format d'heure invalide: {time_str}",
                        }
                    ),
                    400,
                )

        # Sauvegarder et mettre à jour l'instance
        try:
            automation.save_check_times(validated_times)

            return jsonify(
                {
                    "success": True,
                    "message": "Horaires mis à jour",
                    "times": validated_times,
                }
            )

        except Exception as e:
            logger.error(f"Erreur lors de la sauvegarde: {str(e)}")
            return jsonify({"success": False, "error": "Erreur de sauvegarde"}), 500

    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour des horaires: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_monitoring_status")
@require_auth
def get_monitoring_status():
    """Récupère le statut actuel de la surveillance."""
    logger.info("Début de get_monitoring_status")
    try:
        logger.info(f"Chemin du fichier horaires: {Config.CHECK_HOURS_FILE}")

        check_times = []

        # Vérifier si le fichier existe
        if os.path.exists(Config.CHECK_HOURS_FILE):
            logger.info("Le fichier existe")
            try:
                with open(Config.CHECK_HOURS_FILE, "r", encoding="utf-8") as f:
                    # Lire tout le contenu d'abord
                    file_content = f.read()
                    logger.info(f"Contenu du fichier: {file_content}")

                    if file_content.strip():  # Vérifier que le fichier n'est pas vide
                        try:
                            data = json.loads(file_content)
                            check_times = data.get("check_times", [])
                            logger.info(f"Horaires chargés: {check_times}")
                        except json.JSONDecodeError as je:
                            logger.error(f"Erreur de décodage JSON: {je}")
                            # Recréer le fichier avec un contenu valide
                            check_times = []
                            new_data = {
                                "check_times": check_times,
                                "last_updated": datetime.now().isoformat(),
                            }
                            with open(
                                Config.CHECK_HOURS_FILE, "w", encoding="utf-8"
                            ) as f:
                                json.dump(new_data, f, indent=2)
                    else:
                        logger.warning(
                            "Fichier vide, création avec un contenu par défaut"
                        )
                        check_times = []
                        new_data = {
                            "check_times": check_times,
                            "last_updated": datetime.now().isoformat(),
                        }
                        with open(Config.CHECK_HOURS_FILE, "w", encoding="utf-8") as f:
                            json.dump(new_data, f, indent=2)

            except Exception as e:
                logger.error(f"Erreur lors de la lecture du fichier: {str(e)}")
                logger.exception(e)
        else:
            logger.warning("Fichier non trouvé, création...")
            os.makedirs(os.path.dirname(Config.CHECK_HOURS_FILE), exist_ok=True)
            new_data = {"check_times": [], "last_updated": datetime.now().isoformat()}
            with open(Config.CHECK_HOURS_FILE, "w", encoding="utf-8") as f:
                json.dump(new_data, f, indent=2)

        status = {
            "is_monitoring": automation.get_monitoring_status()["is_monitoring"],
            "check_times": check_times,
            "last_check": automation.statistics_manager.get_last_check_time(),
        }

        logger.info(f"Statut complet: {status}")
        return jsonify({"success": True, "status": status})

    except Exception as e:
        logger.error(f"Erreur lors de la récupération du statut: {str(e)}")
        logger.exception(e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.errorhandler(404)
def not_found_error(error):
    """Gestion des erreurs 404."""
    if request.path.startswith("/static/"):
        return send_from_directory("static", request.path[8:])
    return jsonify({"success": False, "error": "Route not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Gestion des erreurs 500."""
    if "quotaExceeded" in str(error):
        next_check = datetime.now() + timedelta(hours=1)
        message = (
            f"Le quota API YouTube a atteint sa limite quotidienne. "
            f"Prochaine vérification à {next_check.strftime('%H:%M')}"
        )
        return (
            jsonify(
                {
                    "success": False,
                    "error": message,
                    "next_check": next_check.isoformat(),
                }
            ),
            429,
        )  # Code 429 pour Too Many Requests

    logger.error(f"Erreur interne du serveur: {str(error)}")
    return (
        jsonify(
            {
                "success": False,
                "error": "Erreur interne du serveur",
                "details": str(error) if app.debug else None,
            }
        ),
        500,
    )


def cleanup():
    """Nettoie les ressources avant la fermeture."""
    global monitoring_thread, is_monitoring
    try:
        is_monitoring = False
        if monitoring_thread and monitoring_thread.is_alive():
            monitoring_thread.join(timeout=1)
        if automation:
            automation.cleanup()
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage: {str(e)}")


if __name__ == "__main__":
    try:
        # Configuration initiale
        automation.authenticate()

        # Configuration de base sans SSL
        app.run(
            debug=Config.FLASK_DEBUG,
            port=Config.FLASK_PORT,
            host="127.0.0.1",
            use_reloader=False,  # Désactivé pour éviter les doubles threads
            ssl_context=None,  # Désactiver SSL pour le développement local
        )

    except KeyboardInterrupt:
        logger.info("Arrêt demandé par l'utilisateur")
        cleanup()
    except Exception as e:
        logger.error(f"Erreur fatale: {str(e)}")
        cleanup()
    finally:
        cleanup()
