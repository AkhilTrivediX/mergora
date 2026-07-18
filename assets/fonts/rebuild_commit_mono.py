#!/usr/bin/env python3
"""Rebuild the pinned, repaired Commit Mono WOFF2 asset deterministically."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import brotli
import fontTools
from fontTools.subset import Options, Subsetter, load_font, parse_unicodes, save_font
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


FONTTOOLS_VERSION = "4.62.1"
BROTLI_VERSION = "1.2.0"
SOURCE_SHA256 = "98de9a901163a769812c3cf2f1b86d63a98a9ced6720d747aa6652688407c34f"
OUTPUT_NAME = "commit-mono-latin-greek-wght.woff2"
UNICODE_RANGES = (
    "U+0000-024F",
    "U+0300-03FF",
    "U+1E00-1FFF",
    "U+2000-206F",
    "U+2070-209F",
    "U+20A0-20CF",
    "U+2100-214F",
    "U+2190-21FF",
    "U+2200-22FF",
    "U+2300-23FF",
    "U+25A0-25FF",
    "U+2600-26FF",
    "U+FFFD",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        type=Path,
        help="Pinned upstream CommitMonoV143-VF.ttf with the manifest source digest.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / OUTPUT_NAME,
        help="Destination WOFF2 path (defaults to the tracked asset).",
    )
    parser.add_argument(
        "--verify-manifest",
        action="store_true",
        help="Require the rebuilt byte count and digest to match manifest.json.",
    )
    return parser.parse_args()


def assert_toolchain() -> None:
    if fontTools.__version__ != FONTTOOLS_VERSION:
        raise RuntimeError(
            f"fontTools {FONTTOOLS_VERSION} is required; found {fontTools.__version__}."
        )
    if brotli.__version__ != BROTLI_VERSION:
        raise RuntimeError(f"Brotli {BROTLI_VERSION} is required; found {brotli.__version__}.")


def subset_options() -> Options:
    options = Options()
    options.parse_opts(
        [
            "--flavor=woff2",
            "--layout-features=*",
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
            "--symbol-cmap",
            "--legacy-cmap",
            "--notdef-glyph",
            "--notdef-outline",
            "--recommended-glyphs",
            "--drop-tables+=DSIG",
        ]
    )
    return options


def rebuild(source: Path, output: Path) -> dict[str, object]:
    if not source.is_file():
        raise FileNotFoundError(f"Commit Mono source does not exist: {source}")
    actual_source_hash = sha256(source)
    if actual_source_hash != SOURCE_SHA256:
        raise RuntimeError(
            "Commit Mono source digest mismatch: "
            f"expected {SOURCE_SHA256}, found {actual_source_hash}."
        )

    source_font = TTFont(source, lazy=False, recalcTimestamp=False)
    source_axes = {
        axis.axisTag: (axis.minValue, axis.defaultValue, axis.maxValue)
        for axis in source_font["fvar"].axes
    }
    if source_axes != {"wght": (200.0, 200.0, 700.0), "ital": (0.0, 0.0, 1.0)}:
        raise RuntimeError(f"Unexpected Commit Mono variation axes: {source_axes!r}.")

    source_maxp = source_font["maxp"]
    if source_maxp.maxZones != 0 or source_maxp.maxTwilightPoints != 0:
        raise RuntimeError(
            "The documented upstream maxp repair no longer applies; inspect the new source."
        )

    instantiateVariableFont(source_font, {"ital": 0.0}, inplace=True)
    # OpenType maxp v1 permits one or two zones, never zero. This no-twilight font
    # needs only the glyph zone. Firefox rejects the upstream zero value.
    source_font["maxp"].maxZones = 1

    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="mergora-commit-mono-") as temporary_directory:
        instantiated_path = Path(temporary_directory) / "CommitMonoV143-normal.ttf"
        source_font.save(instantiated_path, reorderTables=True)

        options = subset_options()
        font = load_font(instantiated_path, options, lazy=False)
        subsetter = Subsetter(options=options)
        subsetter.populate(unicodes=parse_unicodes(",".join(UNICODE_RANGES)))
        subsetter.subset(font)
        if font["maxp"].maxTwilightPoints != 0:
            raise RuntimeError("The Commit Mono subset unexpectedly contains twilight points.")
        font["maxp"].maxZones = 1
        save_font(font, output, options)

    rebuilt = TTFont(output, lazy=False, recalcTimestamp=False)
    axes = {
        axis.axisTag: (axis.minValue, axis.defaultValue, axis.maxValue)
        for axis in rebuilt["fvar"].axes
    }
    if axes != {"wght": (200.0, 200.0, 700.0)}:
        raise RuntimeError(f"Unexpected rebuilt Commit Mono variation axes: {axes!r}.")
    if rebuilt["maxp"].maxZones != 1 or rebuilt["maxp"].maxTwilightPoints != 0:
        raise RuntimeError("The rebuilt Commit Mono maxp table is invalid.")

    return {
        "asset": output.name,
        "bytes": output.stat().st_size,
        "maxTwilightPoints": rebuilt["maxp"].maxTwilightPoints,
        "maxZones": rebuilt["maxp"].maxZones,
        "sha256": sha256(output),
        "sourceSha256": actual_source_hash,
    }


def verify_manifest(result: dict[str, object]) -> None:
    manifest_path = Path(__file__).resolve().parent / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    family = next(
        entry for entry in manifest["families"] if entry["family"] == "Commit Mono"
    )
    if result["bytes"] != family["bytes"] or result["sha256"] != family["sha256"]:
        raise RuntimeError(
            "Rebuilt Commit Mono does not match manifest.json: "
            f"rebuilt {result['bytes']} bytes/{result['sha256']}, "
            f"manifest {family['bytes']} bytes/{family['sha256']}."
        )


def main() -> None:
    arguments = parse_arguments()
    assert_toolchain()
    result = rebuild(arguments.source.resolve(), arguments.output.resolve())
    if arguments.verify_manifest:
        verify_manifest(result)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
