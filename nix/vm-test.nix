# Throwaway QEMU VM for smoke-testing services.lovepager-web end to end,
# without touching real infrastructure/secrets. Not meant to resemble a real
# deployment: local postgres, no reverse proxy/TLS, no agenix, baked-in dummy
# secrets. See web/flake.nix's `nixosConfigurations.lovepager-vm-test`.
{ backendPackage }:
{ modulesPath, pkgs, lib, ... }:
{
  imports = [
    (modulesPath + "/virtualisation/qemu-vm.nix")
  ];

  system.stateVersion = "26.05";
  documentation.enable = false;

  virtualisation = {
    memorySize = 1536;
    diskSize = 4096;
    graphics = false;
    forwardPorts = [
      {
        from = "host";
        host.port = 8007;
        guest.port = 8007;
      }
    ];
  };

  services.getty.autologinUser = "root";

  networking.firewall.allowedTCPPorts = [ 8007 ];

  environment.systemPackages = [ pkgs.curl ];

  # Dummy, throwaway credentials -- never reuse these for a real deployment.
  environment.etc."lovepager-web-test.env".text = ''
    SECRET_KEY=test-vm-not-a-real-secret-0123456789abcdef
    FIRST_SUPERUSER_PASSWORD=test-vm-password-please-change
  '';

  services.lovepager-web = {
    enable = true;
    package = backendPackage;
    listenAddress = "0.0.0.0";
    port = 8007;
    projectName = "LovePager (VM test)";
    # Same-origin: the frontend bundle was built with an empty VITE_API_URL,
    # so it calls relative paths and never needs cross-origin CORS at all.
    frontendHost = "http://localhost:8007";
    deviceApiUrl = "http://localhost:8007";
    firstSuperuserEmail = "admin@example.com";
    credentialsFile = "/etc/lovepager-web-test.env";
    database.createLocally = true;
  };
}
