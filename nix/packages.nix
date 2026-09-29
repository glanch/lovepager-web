{
  pkgs,
  lib,
  pythonSet,
  workspace,
  python,
}:
let
  # Only `bun install`ing is done in the network-enabled fixed-output
  # derivation; the actual `vite build` runs offline afterwards so it can be
  # rebuilt cheaply per VITE_API_URL without touching the network again.
  #
  # NOTE: `outputHash` below is a placeholder. Build it once with
  #   nix build .#lovepager-frontend-deps
  # it will fail with a hash mismatch reporting the real value -- paste that
  # in below, then rebuild.
  frontendDeps = pkgs.stdenvNoCC.mkDerivation {
    pname = "lovepager-frontend-deps";
    version = "0.0.0";
    src = ../.;

    nativeBuildInputs = [ pkgs.bun ];

    buildPhase = ''
      runHook preBuild
      export HOME="$TMPDIR"
      bun install --frozen-lockfile
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p "$out"
      cp -r node_modules "$out/node_modules"
      if [ -d frontend/node_modules ]; then
        cp -r frontend/node_modules "$out/frontend-node_modules"
      fi
      runHook postInstall
    '';

    dontFixup = true;

    outputHash = "sha256-gX97wuMBYZMN87PYAVEWtbuxayW+JO9ODxlogqEVr9w=";
    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
  };

  # Builds the Vite production bundle for a given public API origin. Pass the
  # domain the backend will be reachable under (e.g.
  # "https://api.lovepager.taui.glan.ch") so the frontend calls the right
  # host; pass "" to build a same-origin bundle instead.
  mkFrontend =
    {
      viteApiUrl ? "",
    }:
    pkgs.stdenvNoCC.mkDerivation {
      pname = "lovepager-frontend";
      version = "0.0.0";
      src = ../.;

      # `patchShebangs` only rewrites `#!/usr/bin/env X` if it can find `X`
      # among nativeBuildInputs; `tsc`, `vite`, etc. shebang on `node`, so it
      # has to be present here even though `bun` drives the actual build.
      nativeBuildInputs = [
        pkgs.bun
        pkgs.nodejs
      ];

      env.VITE_API_URL = viteApiUrl;

      buildPhase = ''
        runHook preBuild
        export HOME="$TMPDIR"
        cp -r ${frontendDeps}/node_modules ./node_modules
        chmod -R u+w node_modules
        if [ -d ${frontendDeps}/frontend-node_modules ]; then
          cp -r ${frontendDeps}/frontend-node_modules frontend/node_modules
          chmod -R u+w frontend/node_modules
        fi
        # node_modules was copied in from a separate derivation after the
        # default patchShebangs phase already ran, so bins like tsc still
        # have `#!/usr/bin/env node` shebangs that don't resolve in the
        # sandbox (no /usr/bin/env). Patch them now.
        patchShebangs node_modules
        if [ -d frontend/node_modules ]; then
          patchShebangs frontend/node_modules
        fi
        cd frontend
        bun run build
        runHook postBuild
      '';

      # vite.config.ts sets build.outDir = "../backend/app/frontend"
      installPhase = ''
        runHook preInstall
        cp -r ../backend/app/frontend "$out"
        runHook postInstall
      '';
    };

  # Builds the backend virtualenv with the matching frontend bundle baked
  # into `app/frontend` -- exactly what `backend/Dockerfile` does by copying
  # the frontend-build stage's output into the image before `uv sync`.
  #
  # Alembic migration files aren't part of the installed `app` wheel, so
  # they're carried alongside the venv under `share/lovepager-web`.
  lovepagerBackend =
    {
      viteApiUrl ? "",
    }:
    let
      frontendDist = mkFrontend { inherit viteApiUrl; };

      mergedBackendSrc = pkgs.runCommand "lovepager-backend-src" { } ''
        cp -r ${../backend} "$out"
        chmod -R u+w "$out"
        rm -rf "$out/app/frontend"
        cp -r ${frontendDist} "$out/app/frontend"
      '';

      pythonSet' = pythonSet.overrideScope (
        final: prev: {
          app = prev.app.overrideAttrs (_old: {
            src = mergedBackendSrc;
          });
        }
      );

      venv = pythonSet'.mkVirtualEnv "lovepager-backend-env" workspace.deps.default;

      # alembic.ini has `script_location = app/alembic`, resolved relative to
      # the cwd alembic is invoked from. The migration scripts themselves
      # live under `backend/app/alembic/` -- inside the `app` package -- so
      # they're already installed into the venv's site-packages; only
      # alembic.ini (which sits one level up, outside the package) needs to
      # be carried alongside it, plus a symlink recreating the `app/alembic`
      # relative path alembic.ini expects.
      installedAppAlembicDir = "${venv}/${python.sitePackages}/app/alembic";
    in
    pkgs.runCommand "lovepager-backend"
      {
        passthru = { inherit venv frontendDist; };
      }
      ''
        mkdir -p "$out"
        for entry in ${venv}/*; do
          name="$(basename "$entry")"
          # The venv already has its own share/ (e.g. man pages); merge into
          # it rather than symlinking it wholesale, since we need to add our
          # own share/lovepager-web underneath -- can't mkdir inside a
          # symlink pointing at a read-only store path.
          if [ "$name" = "share" ]; then
            continue
          fi
          ln -s "$entry" "$out/$name"
        done
        mkdir -p "$out/share"
        if [ -d ${venv}/share ]; then
          for shareEntry in ${venv}/share/*; do
            ln -s "$shareEntry" "$out/share/$(basename "$shareEntry")"
          done
        fi
        mkdir -p "$out/share/lovepager-web/app"
        cp ${../backend}/alembic.ini "$out/share/lovepager-web/alembic.ini"
        ln -s ${installedAppAlembicDir} "$out/share/lovepager-web/app/alembic"
      '';
in
{
  inherit
    frontendDeps
    mkFrontend
    lovepagerBackend
    ;
}
