import os
import json
import logging
from datetime import datetime, timedelta
from datetime import timedelta
from dotenv import load_dotenv

# Configuration du logging de base
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Charger les variables d'environnement
load_dotenv()


class ThemeConfig:
    """Configuration des thèmes de l'application."""

    DARK = {
        "background": "#1F2937",
        "backgroundSecondary": "#111827",
        "text": "#F9FAFB",
        "textSecondary": "#D1D5DB",
        "border": "#374151",
        "accent": "#EF4444",
        "surface": "#374151",
        "surfaceHover": "#4B5563",
        "headerBg": "#1F2937",
        "cardBg": "#1F2937",
        "inputBg": "#374151",
        "inputBorder": "#4B5563",
        "inputText": "#F9FAFB",
        "timeChip": {
            "bg": "#374151",
            "text": "#F9FAFB",
            "hover": "#4B5563",
            "activeBg": "#EF4444",
            "activeText": "#FFFFFF",
        },
    }

    LIGHT = {
        "background": "#FFFFFF",
        "backgroundSecondary": "#F3F4F6",
        "text": "#111827",
        "textSecondary": "#4B5563",
        "border": "#E5E7EB",
        "accent": "#EF4444",
        "surface": "#F9FAFB",
        "surfaceHover": "#F3F4F6",
        "headerBg": "#FFFFFF",
        "cardBg": "#FFFFFF",
        "inputBg": "#F9FAFB",
        "inputBorder": "#E5E7EB",
        "inputText": "#111827",
        "timeChip": {
            "bg": "#E5E7EB",
            "text": "#1F2937",
            "hover": "#D1D5DB",
            "activeBg": "#EF4444",
            "activeText": "#FFFFFF",
        },
    }


class Config:
    """Configuration de l'application YouTube Watch Later Pro."""

    # Chemins des fichiers
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    LOGS_DIR = os.path.join(BASE_DIR, "logs")

    SELECTED_CHANNELS_FILE = os.path.join(DATA_DIR, "selected_channels.txt")
    STATISTICS_FILE = os.path.join(DATA_DIR, "statistics.json")
    CLIENT_SECRETS_FILE = os.path.join(BASE_DIR, "client_secrets.json")
    TOKEN_PICKLE_FILE = os.path.join(DATA_DIR, "token.pickle")
    LOG_FILE = os.path.join(LOGS_DIR, "youtube_automation.log")
    CHECK_HOURS_FILE = os.path.join(DATA_DIR, "check_hours.json")
    THEME_FILE = os.path.join(DATA_DIR, "theme.json")
    VIDEOS_TRACKING_FILE = os.path.join(DATA_DIR, "tracked_videos.json")

    # YouTube API
    YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
    YOUTUBE_QUOTA_LIMIT = int(os.getenv("YOUTUBE_QUOTA_LIMIT", "10000"))
    YOUTUBE_QUOTA_RESERVE = int(os.getenv("YOUTUBE_QUOTA_RESERVE", "1000"))
    WATCH_LATER_PLAYLIST_NAME = "Watch Later Pro"

    # Configuration Flask
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    FLASK_DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"
    FLASK_PORT = int(os.getenv("FLASK_PORT", "8080"))
    SECRET_KEY = os.getenv("SECRET_KEY", os.urandom(24))

    # Paramètres de l'application
    DEFAULT_CHECK_HOURS = [9, 12, 15, 18, 21]  # Heures par défaut
    CHECK_HOURS = [int(h) for h in os.getenv("CHECK_HOURS", "9,12,15,18,21").split(",")]
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    MAX_VIDEOS_PER_CHANNEL = int(os.getenv("MAX_VIDEOS_PER_CHANNEL", 10))
    MAX_RECENT_VIDEOS = int(os.getenv("MAX_RECENT_VIDEOS", 50))
    CHECK_INTERVAL = 60  # Vérification chaque minute

    # Cache et Performance
    CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() == "true"
    CACHE_TYPE = "SimpleCache"
    CACHE_DEFAULT_TIMEOUT = 300
    CACHE_THRESHOLD = 1000
    API_QUOTA_DELAY = float(os.getenv("API_QUOTA_DELAY", 0.1))

    # Thème
    DEFAULT_THEME = "light"
    THEMES = {"dark": ThemeConfig.DARK, "light": ThemeConfig.LIGHT}

    # Statistiques
    STATS_RETENTION_DAYS = int(os.getenv("STATS_RETENTION_DAYS", 30))
    HISTORY_MAX_ITEMS = int(os.getenv("HISTORY_MAX_ITEMS", 100))

    # Sécurité
    SESSION_COOKIE_SECURE = FLASK_ENV == "production"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # Messages d'erreur personnalisés
    ERROR_MESSAGES = {
        "auth_failed": "Échec de l'authentification. Veuillez réessayer.",
        "api_quota": "Limite de quota API YouTube atteinte. Veuillez réessayer plus tard.",
        "playlist_create": "Impossible de créer la playlist Watch Later Pro.",
        "video_add": "Impossible d'ajouter la vidéo à la playlist.",
        "channel_load": "Impossible de charger les informations de la chaîne.",
        "video_load": "Impossible de charger les vidéos.",
        "invalid_channel": "ID de chaîne invalide.",
        "file_not_found": "Fichier de configuration non trouvé.",
        "already_monitoring": "La surveillance est déjà active.",
        "no_channels": "Aucune chaîne sélectionnée à surveiller.",
        "invalid_hours": "Heures de vérification invalides.",
        "quota_exceeded": "Quota API dépassé pour aujourd'hui.",
        "network_error": "Erreur réseau, veuillez réessayer.",
    }

    @classmethod
    def init_app(cls, app):
        """Initialise l'application avec la configuration."""
        # Création des dossiers nécessaires
        os.makedirs(cls.DATA_DIR, exist_ok=True)
        os.makedirs(cls.LOGS_DIR, exist_ok=True)

        # Configuration du logging
        logging.basicConfig(
            level=getattr(logging, cls.LOG_LEVEL),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[logging.FileHandler(cls.LOG_FILE), logging.StreamHandler()],
        )

        # Configuration des headers de sécurité
        @app.after_request
        def add_security_headers(response):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; "
                "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
                "img-src 'self' https://*.ytimg.com https://*.googleusercontent.com https://*.ggpht.com data:; "
                "font-src 'self' https://cdnjs.cloudflare.com;"
            )
            return response

        # Injecter le thème dans chaque réponse
        @app.context_processor
        def inject_theme():
            return {"theme": cls.get_theme(), "theme_colors": cls.get_theme_colors()}

        # Configuration CORS
        if cls.FLASK_ENV == "development":

            @app.after_request
            def after_request(response):
                response.headers["Access-Control-Allow-Origin"] = "*"
                response.headers["Access-Control-Allow-Methods"] = (
                    "GET, POST, PUT, DELETE, OPTIONS"
                )
                response.headers["Access-Control-Allow-Headers"] = "Content-Type"
                return response

        # Vérification des fichiers requis
        if not os.path.exists(cls.CLIENT_SECRETS_FILE):
            app.logger.warning("⚠️  ATTENTION: client_secrets.json est manquant!")

        if not cls.YOUTUBE_API_KEY:
            app.logger.warning(
                "⚠️  ATTENTION: La clé API YouTube est manquante dans .env!"
            )

    @classmethod
    def get_theme(cls):
        """Récupère le thème actuel."""
        try:
            if os.path.exists(cls.THEME_FILE):
                with open(cls.THEME_FILE, "r") as f:
                    data = json.load(f)
                    return data.get("theme", cls.DEFAULT_THEME)
            return cls.DEFAULT_THEME
        except Exception:
            return cls.DEFAULT_THEME

    @classmethod
    def load_check_times(cls):
        """Charge les horaires de vérification depuis le fichier."""
        try:
            if os.path.exists(cls.CHECK_HOURS_FILE):
                with open(cls.CHECK_HOURS_FILE, "r") as f:
                    data = json.load(f)
                    logger.info(f"Horaires chargés: {data.get('check_times', [])}")
                    return data.get("check_times", [])
            logger.warning("Fichier des horaires non trouvé")
            return []
        except Exception as e:
            logger.error(f"Erreur lors du chargement des horaires: {str(e)}")
            return []

    @classmethod
    def save_check_times(cls, times):
        """Sauvegarde les horaires de vérification."""
        try:
            os.makedirs(os.path.dirname(cls.CHECK_HOURS_FILE), exist_ok=True)
            data = {"check_times": times, "last_updated": datetime.now().isoformat()}
            with open(cls.CHECK_HOURS_FILE, "w") as f:
                json.dump(data, f, indent=2)
            logger.info(f"Horaires sauvegardés: {times}")
            return True
        except Exception as e:
            logger.error(f"Erreur lors de la sauvegarde des horaires: {str(e)}")
            return False

    @classmethod
    def save_theme(cls, theme):
        """Sauvegarde le thème."""
        try:
            os.makedirs(os.path.dirname(cls.THEME_FILE), exist_ok=True)
            with open(cls.THEME_FILE, "w") as f:
                json.dump({"theme": theme}, f)
            return True
        except Exception:
            return False

    @classmethod
    def get_theme_colors(cls):
        """Récupère les couleurs du thème actuel."""
        theme = cls.get_theme()
        return cls.THEMES.get(theme, cls.THEMES[cls.DEFAULT_THEME])

    @classmethod
    def validate_check_hours(cls, hours):
        """Valide les heures de vérification."""
        try:
            validated_hours = []
            for hour in hours:
                try:
                    hours, minutes = map(int, hour.split(":"))
                    if 0 <= hours < 24 and 0 <= minutes < 60:
                        validated_hours.append(f"{hours:02d}:{minutes:02d}")
                    else:
                        raise ValueError(f"Heure invalide: {hour}")
                except Exception as e:
                    raise ValueError(f"Format d'heure invalide: {hour}")
            return sorted(list(set(validated_hours)))
        except Exception as e:
            raise ValueError(f"Configuration des heures invalide: {str(e)}")

    @classmethod
    def get_error_message(cls, error_key):
        """Récupère un message d'erreur personnalisé."""
        return cls.ERROR_MESSAGES.get(
            error_key, "Une erreur inattendue s'est produite."
        )


# Configuration active
config = {
    "development": Config,
    "production": Config,
    "testing": Config,
    "default": Config,
}

active_config = config[os.getenv("FLASK_ENV", "development")]
