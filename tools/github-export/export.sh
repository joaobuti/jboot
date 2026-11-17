#!/usr/bin/env bash
# Publica uma copia limpa do JBoot no GitHub (joaobuti/jboot), com historico
# proprio. O GitLab continua sendo o repositorio de trabalho; o GitHub recebe
# um commit por exportacao com o estado do ref escolhido.
#
#   tools/github-export/export.sh            # monta e confere, sem push
#   tools/github-export/export.sh --push     # monta, confere e envia
#   REF=origin/main tools/github-export/export.sh
#
# Regras (decididas pelo usuario em 2026-11-17):
#   - planilhas nao sobem (xlsx, xls, ods, csv);
#   - o CPF do Operador Senior vira um CPF ficticio;
#   - arquivos acima de 100 MB nao sobem;
#   - o template Velzon completo fica no .gitignore e fora da copia;
#   - paginas de demonstracao do Velzon nos apps ficam de fora (exclude.txt);
#   - o push usa a chave dedicada do Host `github-joaobuti` (~/.ssh/config).
# Qualquer verificacao que falhe aborta antes do commit.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
HERE="$ROOT/tools/github-export"
REF=${REF:-main}
OUT=${JBOOT_GITHUB_EXPORT_DIR:-$HOME/.cache/jboot-github-export}
REMOTE=${JBOOT_GITHUB_REMOTE:-git@github-joaobuti:joaobuti/jboot.git}
PUSH=0
[[ "${1:-}" == "--push" ]] && PUSH=1

CPF_REAL=00000000191
CPF_REAL_FMT=000.000.001-91
CPF_FAKE=00000000191
CPF_FAKE_FMT=000.000.001-91

SHA=$(git -C "$ROOT" rev-parse --verify "$REF^{commit}")
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "exportando $REF ($(git -C "$ROOT" rev-parse --short "$SHA"))"
git -C "$ROOT" archive "$SHA" | tar -x -C "$STAGE"

# 1. caminhos excluidos
while IFS= read -r path; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  rm -rf -- "${STAGE:?}/$path"
done < "$HERE/exclude.txt"

# 2. planilhas e arquivos grandes
find "$STAGE" -type f \( -iname '*.xlsx' -o -iname '*.xls' -o -iname '*.ods' -o -iname '*.csv' \) -delete
find "$STAGE" -type f -size +100M -print -delete | sed 's#^#removido (>100 MB): #'

# 3. CPF real -> ficticio (so arquivos de texto)
grep -rlIZ -e "$CPF_REAL" -e "$CPF_REAL_FMT" "$STAGE" | xargs -0 -r sed -i \
  -e "s/$CPF_REAL/$CPF_FAKE/g" -e "s/${CPF_REAL_FMT//./\\.}/$CPF_FAKE_FMT/g"

# 4. .gitignore da copia
printf '\n# Template Velzon completo: fora da copia publica (licenca).\nimplementations/templates/original/\n' >> "$STAGE/.gitignore"

# 5. verificacoes bloqueantes
fail=0
check() { if [[ -n "$2" ]]; then echo "BLOQUEIO: $1"; echo "$2" | head -10; fail=1; fi; }
check "CPF real presente" "$(grep -rlI -e "$CPF_REAL" -e "$CPF_REAL_FMT" -e '030\.319' "$STAGE" || true)"
check "planilha presente" "$(find "$STAGE" -type f \( -iname '*.xlsx' -o -iname '*.xls' -o -iname '*.ods' -o -iname '*.csv' \))"
check "arquivo acima de 100 MB" "$(find "$STAGE" -type f -size +100M)"
check "template Velzon completo presente" "$(ls -d "$STAGE/implementations/templates/original" 2>/dev/null || true)"
# Tokens falsos dos testes (canary / not-a-...) sao permitidos explicitamente.
check "chave de API/token/chave privada" "$(grep -rnoIE 'AIza[0-9A-Za-z_-]{35}|glpat-[0-9A-Za-z_-]{20}|gldt-[0-9A-Za-z_-]{20}|glrt-[0-9A-Za-z_-]{20}|sk-(proj-|ant-)?[A-Za-z0-9_-]{32}|-----BEGIN [A-Z ]*PRIVATE KEY-----' "$STAGE" | grep -vE ':sk-ant-(oat01-unitroutinetokencanary[0-9]+|api03-not-a-routine-token-[0-9]+)$' || true)"
check "arquivo .env real" "$(find "$STAGE" -type f -name '.env*' ! -name '*.example' ! -name '*.sample' ! -name '*.template')"
if (( fail )); then echo "exportacao abortada"; exit 1; fi
echo "verificacoes ok: $(find "$STAGE" -type f | wc -l) arquivos, $(du -sh "$STAGE" | cut -f1)"

# 6. repositorio da copia
if [[ ! -d "$OUT/.git" ]]; then
  mkdir -p "$OUT"
  git -C "$OUT" init -q -b main
  git -C "$OUT" remote add origin "$REMOTE"
fi
rsync -a --delete --exclude .git "$STAGE/" "$OUT/"
git -C "$OUT" add -A
if git -C "$OUT" diff --cached --quiet; then
  echo "sem mudancas desde a ultima exportacao"
else
  git -C "$OUT" \
    -c user.name="$(git -C "$ROOT" config user.name)" \
    -c user.email="$(git -C "$ROOT" config user.email)" \
    commit -q -m "Sync JBoot ($(git -C "$ROOT" log -1 --format=%cs "$SHA"))"
  echo "commit: $(git -C "$OUT" log -1 --format='%h %s')"
fi

if (( PUSH )); then
  git -C "$OUT" push -u origin main
else
  echo "sem push (use --push). Copia em $OUT"
fi
