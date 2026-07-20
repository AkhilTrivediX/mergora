"""Rebuild the deterministic, preload-sized Schibsted subset used by the static site."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from fontTools import subset


DIRECTORY = Path(__file__).resolve().parent
SOURCE = DIRECTORY / "schibsted-grotesk-latin-ext-wght.woff2"
OUTPUT = DIRECTORY / "schibsted-grotesk-site-basic-wght.woff2"
EXPECTED_SOURCE_SHA256 = "34e6c5583165b9c809e2a6a3af4f33edf3fbdf7c0de5ad9e466bd636d316e52b"
EXPECTED_OUTPUT_SHA256 = "dcbf3d18a5677584e924634fd7181291f6f6644f5ddef77291e4940fde62d92f"
UNICODES = "U+0020-007E,U+00A0,U+00B7,U+00D7,U+2010-2027,U+2032-2033,U+2039-203A,U+20AC,U+2190-2199"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source_digest = sha256(SOURCE)
    if source_digest != EXPECTED_SOURCE_SHA256:
        raise SystemExit(f"Refusing unreviewed Schibsted source digest: {source_digest}")

    with NamedTemporaryFile(
        dir=DIRECTORY, prefix=".schibsted-site-", suffix=".woff2", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        subset.main(
            [
                str(SOURCE),
                f"--output-file={temporary_path}",
                "--flavor=woff2",
                f"--unicodes={UNICODES}",
                "--layout-features=*",
                "--name-IDs=*",
                "--name-legacy",
                "--name-languages=*",
                "--notdef-glyph",
                "--notdef-outline",
                "--recommended-glyphs",
            ]
        )
        output_digest = sha256(temporary_path)
        if output_digest != EXPECTED_OUTPUT_SHA256:
            raise SystemExit(f"Unexpected site subset digest: {output_digest}")
        os.replace(temporary_path, OUTPUT)
    finally:
        temporary_path.unlink(missing_ok=True)

    print(f"Wrote {OUTPUT.name} ({OUTPUT.stat().st_size} bytes, sha256:{sha256(OUTPUT)})")


if __name__ == "__main__":
    main()
