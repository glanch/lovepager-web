{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.lovepager-web;
in
{
  options.services.lovepager-web = {
    enable = lib.mkEnableOption "LovePager web app (FastAPI backend serving the bundled React frontend)";

    package = lib.mkOption {
      type = lib.types.package;
      description = ''
        Derivation providing the `fastapi`/`alembic` executables (a Python
        virtualenv built via uv2nix) plus the installed `app` package and the
        Alembic migration files under `share/lovepager-web`.

        Build this with the flake's `lovepagerBackend { viteApiUrl = "https://api.example.com"; }`
        function so the React frontend is compiled with the correct
        `VITE_API_URL` baked in at build time.
      '';
    };

    listenAddress = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = "Address on which the service should listen.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8000;
      description = "Port on which to serve the LovePager backend (and bundled frontend).";
    };

    workers = lib.mkOption {
      type = lib.types.ints.positive;
      default = 4;
      description = "Number of Uvicorn worker processes (passed to `fastapi run --workers`).";
    };

    projectName = lib.mkOption {
      type = lib.types.str;
      default = "LovePager";
      description = "Maps to the `PROJECT_NAME` setting.";
    };

    frontendHost = lib.mkOption {
      type = lib.types.str;
      example = "https://lovepager.taui.glan.ch";
      description = ''
        Public origin of the deployed frontend. Maps to the `FRONTEND_HOST`
        setting, which is also the sole origin the backend allows in its CORS
        policy (`app/main.py` sets `allow_origins=[settings.FRONTEND_HOST]`).
      '';
    };

    deviceApiUrl = lib.mkOption {
      type = lib.types.str;
      example = "https://api.lovepager.taui.glan.ch";
      description = ''
        Public base URL of the API, embedded in the device-registration QR
        code so the ESP32 gadget knows where to reach the backend. Maps to
        the `DEVICE_API_URL` setting.
      '';
    };

    firstSuperuserEmail = lib.mkOption {
      type = lib.types.str;
      example = "admin@example.com";
      description = "Maps to the `FIRST_SUPERUSER` setting (email address, not a secret).";
    };

    sentryDsn = lib.mkOption {
      type = with lib.types; nullOr str;
      default = null;
      description = "Maps to the `SENTRY_DSN` setting.";
    };

    emailsFromEmail = lib.mkOption {
      type = with lib.types; nullOr str;
      default = null;
      description = "Maps to the `EMAILS_FROM_EMAIL` setting.";
    };

    smtp = {
      host = lib.mkOption {
        type = with lib.types; nullOr str;
        default = null;
        description = "Maps to the `SMTP_HOST` setting. Leave null to disable outgoing email.";
      };
      port = lib.mkOption {
        type = lib.types.port;
        default = 587;
        description = "Maps to the `SMTP_PORT` setting.";
      };
      user = lib.mkOption {
        type = with lib.types; nullOr str;
        default = null;
        description = "Maps to the `SMTP_USER` setting.";
      };
      tls = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Maps to the `SMTP_TLS` setting.";
      };
      ssl = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Maps to the `SMTP_SSL` setting.";
      };
    };

    settings = lib.mkOption {
      type = with lib.types; attrsOf anything;
      default = { };
      example = {
        EMAIL_RESET_TOKEN_EXPIRE_HOURS = 48;
      };
      description = ''
        Catch-all for any other environment variable understood by
        `backend/app/core/config.py`'s `Settings` class that isn't already
        exposed as a dedicated option above.
      '';
    };

    credentialsFile = lib.mkOption {
      type = with lib.types; nullOr path;
      default = null;
      example = "/run/agenix/lovepager-web-env";
      description = ''
        File containing secrets used by LovePager, such as `SECRET_KEY`,
        `FIRST_SUPERUSER_PASSWORD`, `DATABASE_URL` (unless
        {option}`services.lovepager-web.database.createLocally` is set) and
        `SMTP_PASSWORD`.

        Expects the format of an `EnvironmentFile=`, as described by
        {manpage}`systemd.exec(5)`.
      '';
    };

    database = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Configure a local PostgreSQL database server for LovePager.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.lovepager-web = {
      description = "LovePager web app (FastAPI backend + bundled frontend)";

      after = [ "network-online.target" ] ++ lib.optional cfg.database.createLocally "postgresql.target";
      requires = lib.optional cfg.database.createLocally "postgresql.target";
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];

      environment =
        {
          PROJECT_NAME = cfg.projectName;
          FRONTEND_HOST = cfg.frontendHost;
          DEVICE_API_URL = cfg.deviceApiUrl;
          FIRST_SUPERUSER = cfg.firstSuperuserEmail;
        }
        // lib.optionalAttrs (cfg.sentryDsn != null) { SENTRY_DSN = cfg.sentryDsn; }
        // lib.optionalAttrs (cfg.smtp.host != null) (
          {
            SMTP_HOST = cfg.smtp.host;
            SMTP_PORT = toString cfg.smtp.port;
            SMTP_TLS = if cfg.smtp.tls then "True" else "False";
            SMTP_SSL = if cfg.smtp.ssl then "True" else "False";
          }
          // lib.optionalAttrs (cfg.smtp.user != null) { SMTP_USER = cfg.smtp.user; }
          // lib.optionalAttrs (cfg.emailsFromEmail != null) { EMAILS_FROM_EMAIL = cfg.emailsFromEmail; }
        )
        // (builtins.mapAttrs (_: val: toString val) cfg.settings);

      serviceConfig = {
        DynamicUser = true;
        User = "lovepager";
        WorkingDirectory = "${cfg.package}/share/lovepager-web";
        ExecStartPre = [
          "${cfg.package}/bin/alembic upgrade head"
          "${cfg.package}/bin/python -m app.initial_data"
        ];
        # `fastapi run` takes a file *path* (or auto-discovers one relative
        # to cwd), not a `module:attr` import string -- and our
        # WorkingDirectory (share/lovepager-web) has nothing for it to find.
        # `uvicorn`, which `fastapi run` wraps anyway, takes module:attr
        # directly and needs no filesystem discovery.
        ExecStart = "${cfg.package}/bin/uvicorn app.main:app --host ${cfg.listenAddress} --port ${toString cfg.port} --workers ${toString cfg.workers}";
        EnvironmentFile = lib.mkIf (cfg.credentialsFile != null) cfg.credentialsFile;
        StateDirectory = "lovepager-web";
        Restart = "on-failure";
        StandardOutput = "journal";
      };
    };

    services.lovepager-web.settings = lib.mkIf cfg.database.createLocally {
      # TCP loopback rather than the Unix socket, deliberately: SQLAlchemy
      # parses DATABASE_URL into components itself and hands psycopg a bare
      # `host=` kwarg, so neither the classic `?host=/run/postgresql` query
      # override (which also needs an empty URL host -- rejected by
      # pydantic's PostgresDsn, which requires a non-empty one) nor
      # percent-encoding the socket path as the host (SQLAlchemy doesn't
      # decode `%2F` back to `/` when splitting the URL, so psycopg receives
      # the literal string and tries to DNS-resolve it) survive that
      # pipeline intact. TCP sidesteps all of it.
      DATABASE_URL = lib.mkDefault "postgresql://lovepager@127.0.0.1:5432/lovepager";
    };

    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = true;
      enableTCPIP = true;
      ensureDatabases = [ "lovepager" ];
      ensureUsers = [
        {
          name = "lovepager";
          ensureDBOwnership = true;
        }
      ];
      authentication = lib.mkAfter ''
        host lovepager lovepager 127.0.0.1/32 trust
        host lovepager lovepager ::1/128 trust
      '';
    };
  };
}
