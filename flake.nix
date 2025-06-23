{
  description = "Deno & MQTT devshell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/d12b3ccedb24c8a0e31982001eb4ca1240f3ac7b"; # For cached deno 2.3.5
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        openfw = pkgs.writeShellScriptBin "openfw" ''
          sudo iptables -A INPUT -p tcp --dport 1883 -j ACCEPT
          sudo systemctl reload firewall
        '';

        closefw = pkgs.writeShellScriptBin "closefw" ''
          sudo iptables -D INPUT -p tcp --dport 1883 -j ACCEPT
          sudo systemctl reload firewall
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            nodePackages_latest.prettier # code formatter
            deno # dev tools and runtime
            mosquitto # MQTT broker

            openfw
            closefw
          ];
        };
      }
    );
}
