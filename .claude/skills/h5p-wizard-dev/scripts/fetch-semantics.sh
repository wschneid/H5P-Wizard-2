#!/usr/bin/env bash
# Lädt semantics.json (und library.json-Versionen) der H5P-Bibliotheken von GitHub.
#
#   fetch-semantics.sh OUTDIR [MachineName ...]   -> OUTDIR/<MachineName>.json (+ .library.json)
#   fetch-semantics.sh --versions [MachineName ...] -> Tabelle release/master-Version
#
# Ohne MachineName-Argumente werden alle Einträge aus references/libraries.json verarbeitet.
# Branch-Reihenfolge: master, dann release. (master = aktueller Entwicklungsstand,
# release = oft der auf dem H5P-Hub ausgelieferte Stand – im Zweifel beide prüfen.)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="$HERE/../references/libraries.json"

repo_of() { python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["libraries"].get(sys.argv[2],{}).get("repo",""))' "$REG" "$1"; }
all_libs() { python3 -I -c 'import json,sys;print("\n".join(json.load(open(sys.argv[1]))["libraries"]))' "$REG"; }
version_of() {
  curl -fsS -m 15 "https://raw.githubusercontent.com/$1/$2/library.json" 2>/dev/null \
    | python3 -I -c 'import sys,json;d=json.load(sys.stdin);print("%s.%s.%s"%(d["majorVersion"],d["minorVersion"],d["patchVersion"]))' 2>/dev/null || echo "-"
}

if [[ "${1:-}" == "--versions" ]]; then
  shift
  libs=("$@"); [[ ${#libs[@]} -eq 0 ]] && mapfile -t libs < <(all_libs)
  printf '%-26s %-12s %-12s\n' "Bibliothek" "release" "master"
  for m in "${libs[@]}"; do
    r=$(repo_of "$m"); [[ -z "$r" ]] && { echo "$m: kein Repo in libraries.json" >&2; continue; }
    printf '%-26s %-12s %-12s\n' "$m" "$(version_of "$r" release)" "$(version_of "$r" master)"
  done
  exit 0
fi

OUT="${1:?OUTDIR angeben}"; shift || true
mkdir -p "$OUT"
libs=("$@"); [[ ${#libs[@]} -eq 0 ]] && mapfile -t libs < <(all_libs)
for m in "${libs[@]}"; do
  r=$(repo_of "$m"); [[ -z "$r" ]] && { echo "SKIP $m (kein Repo)" >&2; continue; }
  for b in master release; do
    if curl -fsS -m 20 -o "$OUT/$m.json" "https://raw.githubusercontent.com/$r/$b/semantics.json"; then
      curl -fsS -m 20 -o "$OUT/$m.library.json" "https://raw.githubusercontent.com/$r/$b/library.json" || true
      echo "OK   $m ($r@$b)"; break
    fi
    rm -f "$OUT/$m.json"
  done
  [[ -f "$OUT/$m.json" ]] || echo "FAIL $m" >&2
done
