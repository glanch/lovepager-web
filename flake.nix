{
  description = "LovePager web app: FastAPI backend + bundled React frontend, packaged with uv2nix";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

    pyproject-nix = {
      url = "github:pyproject-nix/pyproject.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      pyproject-nix,
      uv2nix,
      pyproject-build-systems,
      ...
    }:
    let
      inherit (nixpkgs) lib;

      forAllSystems = lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
      ];

      # workspaceRoot = ./. : this flake lives at the uv workspace root
      # (alongside pyproject.toml/uv.lock, with `backend` as the sole
      # [tool.uv.workspace] member) -- same layout the uv2nix hello-world
      # template assumes for a single-member workspace.
      workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = ./.; };

      overlay = workspace.mkPyprojectOverlay { sourcePreference = "wheel"; };

      # `dkimpy` (pulled in transitively via `emails`) has a legacy
      # setup.py build but doesn't declare `setuptools` as a build
      # dependency, so uv2nix's isolated build env lacks it. Backfill it
      # from the pyproject-build-systems overlay already merged into the
      # pythonSet, per uv2nix's documented override pattern.
      pyprojectOverrides = final: prev: {
        dkimpy = prev.dkimpy.overrideAttrs (old: {
          nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ final.resolveBuildSystem {
            setuptools = [ ];
          };
        });
      };

      forSystem =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          python = pkgs.python314;

          pythonSet =
            (pkgs.callPackage pyproject-nix.build.packages { inherit python; }).overrideScope
              (
                lib.composeManyExtensions [
                  pyproject-build-systems.overlays.default
                  overlay
                  pyprojectOverrides
                ]
              );

          web = import ./nix/packages.nix {
            inherit pkgs lib pythonSet workspace python;
          };
        in
        {
          inherit pkgs python pythonSet web;
        };
    in
    {
      lib = forAllSystems (
        system:
        let
          inherit (forSystem system) web;
        in
        {
          lovepagerBackend = web.lovepagerBackend;
          lovepagerFrontend = web.mkFrontend;
        }
      );

      packages = forAllSystems (
        system:
        let
          inherit (forSystem system) web;
        in
        {
          default = web.lovepagerBackend { };
          lovepager-backend = web.lovepagerBackend { };
          lovepager-frontend-deps = web.frontendDeps;
        }
      );

      nixosModules.lovepager-web = import ./nix/module.nix;
      nixosModules.default = self.nixosModules.lovepager-web;

      # Throwaway QEMU VM to smoke-test services.lovepager-web end to end.
      # Run:
      #   nix run .#nixosConfigurations.lovepager-vm-test.config.system.build.vm
      # then, from the host, once it's booted (auto-logs in as root on the
      # console):
      #   curl http://localhost:8000/api/v1/utils/health-check
      #   curl http://localhost:8000/
      nixosConfigurations.lovepager-vm-test =
        let
          system = "x86_64-linux";
        in
        nixpkgs.lib.nixosSystem {
          inherit system;
          modules = [
            self.nixosModules.lovepager-web
            (import ./nix/vm-test.nix { backendPackage = (forSystem system).web.lovepagerBackend { }; })
          ];
        };

      # Editable dev shell for the backend, in the same shape as uv2nix's
      # hello-world template devShell (uv manages the lockfile, Nix supplies
      # the interpreter and native build deps).
      devShells = forAllSystems (
        system:
        let
          inherit (forSystem system) pkgs python pythonSet;

          editableOverlay = workspace.mkEditablePyprojectOverlay { root = "$REPO_ROOT"; };
          editablePythonSet = pythonSet.overrideScope editableOverlay;
          virtualenv = editablePythonSet.mkVirtualEnv "lovepager-backend-dev-env" workspace.deps.all;
        in
        {
          default = pkgs.mkShell {
            packages = [
              virtualenv
              pkgs.uv
              pkgs.bun
            ];
            env = {
              UV_NO_SYNC = "1";
              UV_PYTHON = "${virtualenv}/bin/python";
              UV_PYTHON_DOWNLOADS = "never";
            };
            shellHook = ''
              unset PYTHONPATH
              export REPO_ROOT=$(git rev-parse --show-toplevel)
            '';
          };
        }
      );
    };
}
