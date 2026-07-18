# Self-hosted fonts

Mergora ships two OFL-1.1 variable fonts from commit-pinned primary repositories. The WOFF2 rebuild toolchain is pinned to fontTools 4.62.1 and Brotli 1.2.0. The source font SHA-256, output SHA-256, license SHA-256, weight axis, byte size, Unicode ranges, fallback metrics, and preload decision are machine-readable in `manifest.json`.

## Sources and subsets

- **Schibsted Grotesk** comes from `google/fonts` commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`, path `ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf`. The normal variable `wght` axis is retained from 400–900. The subset retains Basic Latin, Latin-1, Latin Extended, combining marks, Latin Extended Additional, Vietnamese glyphs present upstream, punctuation, currency, letterlike symbols, arrows, math, technical/geometric symbols, and Latin presentation ligatures.
- **Commit Mono 1.143** comes from `eigilnikolajsen/commit-mono` commit `d407cd2bf8e01ca1db70544052fbbb9606406c3b`, path `src/fonts/fontlab/CommitMonoV143-VF.ttf`. The `ital` axis is pinned to normal and the variable `wght` axis is retained from 200–700. Its subset retains the same machine-text ranges plus the font's Greek coverage.

The equivalent subsetting command is:

```text
python -m fontTools.subset SOURCE.ttf --output-file=OUTPUT.woff2 --flavor=woff2 --unicodes=RANGES --layout-features=* --name-IDs=* --name-legacy --name-languages=* --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline --recommended-glyphs --drop-tables+=DSIG
```

Commit Mono is first instantiated with `ital=0`; no italic font face is advertised. The pinned
upstream TTF declares `maxp.maxZones=0`, although OpenType `maxp` version 1 permits only one or
two zones. Because the font has zero twilight points, the deterministic build normalizes that field
to one glyph zone. This is a standards-conformance repair only; it does not change glyph outlines.
Firefox rejects the unnormalized table, while Chromium and WebKit tolerate it.

Rebuild and verify the tracked bytes from the source whose digest is recorded in the manifest:

```text
python -m pip install --requirement assets/fonts/requirements.txt
python assets/fonts/rebuild_commit_mono.py CommitMonoV143-VF.ttf --verify-manifest
```

The rebuild script checks the exact source digest, tool versions, source axes, repair preconditions,
resulting `wght` axis, `maxp` values, output byte count, and SHA-256. It disables timestamp
recalculation, and two independent rebuilds must produce identical bytes.

## Language impact

The brand fonts do not claim glyphs they do not contain. Schibsted Grotesk covers the Latin-script needs of `en-US`, `de-DE`, and Latin pseudo-expansion. Commit Mono additionally preserves upstream Greek for code and machine evidence. The upstream faces do not contain complete Arabic, Hebrew, Japanese, or Devanagari coverage, so `ar-EG`, `he-IL`, `ja-JP`, and `hi-IN` deliberately fall through to the platform's script-capable generic `sans-serif` or `monospace` face. That fallback is part of the token stack, which prevents missing-glyph boxes and avoids mixing a partial script subset with the system face.

Only prose uses Schibsted Grotesk. Commit Mono is limited to code, commands, versions, token values, key names, and machine output.

## Loading and metrics

Preload only `schibsted-grotesk-latin-ext-wght.woff2`, because prose is visible at first paint. Load Commit Mono on demand with code specimens; preloading it would compete with primary content. Both faces use `font-display: swap`.

The generated CSS includes metric-compatible local fallback faces. Schibsted Grotesk is matched against Arial and Commit Mono against Consolas using x-height-based `size-adjust` plus target ascent, descent, and line-gap overrides. These values are recorded in the manifest so layout-shift behavior is reviewable and compiler-generated, not browser- or machine-dependent.
