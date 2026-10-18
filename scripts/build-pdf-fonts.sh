#!/bin/sh
# Builds public/fonts/pdf/, the fonts the PDF export embeds so astrological glyphs draw as glyphs (#655): DejaVu Sans
# 2.37 (regular, bold, oblique; Bitstream Vera licence, DejaVu changes public domain) subset to Latin, Dutch accents,
# punctuation and the astrological symbols. DejaVu lacks four aspect glyphs (sextile, semisextile, quincunx,
# sesquiquadrate); no aspect glyph is drawn in PDF text today, so no second font is shipped for them.
#
# The input is downloaded by hand and checked against the SHA-256 sum below, so a changed upstream file fails loudly:
#   curl -LO https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2
#   python3 -m pip install fonttools   # build-time only; never shipped
#   sh scripts/build-pdf-fonts.sh <dir holding the download>
#
# Layout features and hinting are dropped: jsPDF uses neither, and the files shrink from about 70 kB to 38 kB each.
set -eu
# A fixed timestamp in the fonts' headers, so two runs give byte-identical files.
export SOURCE_DATE_EPOCH=1704067200

IN=${1:?usage: sh scripts/build-pdf-fonts.sh <download dir>}
OUT=$(cd "$(dirname "$0")/.." && pwd)/public/fonts/pdf
DEJAVU_SHA=fa9ca4d13871dd122f61258a80d01751d603b4d3ee14095d65453b4e846e17d7

check() {
  actual=$(shasum -a 256 "$1" | cut -d' ' -f1)
  [ "$actual" = "$2" ] || { echo "unexpected SHA-256 for $1: $actual" >&2; exit 1; }
}
check "$IN/dejavu-fonts-ttf-2.37.tar.bz2" "$DEJAVU_SHA"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
tar -xjf "$IN/dejavu-fonts-ttf-2.37.tar.bz2" -C "$WORK"
mkdir -p "$OUT"

LATIN_AND_SYMBOLS='U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-2033,U+2039-203A,U+20AC,U+2190-2193,U+211E,U+2220,U+25A1,U+25B3,U+2609-260D,U+263D-2653,U+26B3-26B8'
for face in DejaVuSans DejaVuSans-Bold DejaVuSans-Oblique; do
  pyftsubset "$WORK/dejavu-fonts-ttf-2.37/ttf/$face.ttf" --unicodes="$LATIN_AND_SYMBOLS" --layout-features='' \
    --no-hinting --desubroutinize --name-IDs='*' --name-legacy --notdef-outline --output-file="$OUT/$face.ttf"
done
cp "$WORK/dejavu-fonts-ttf-2.37/LICENSE" "$OUT/LICENSE-DejaVu.txt"

echo "wrote $OUT"
