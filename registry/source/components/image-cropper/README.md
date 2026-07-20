# Image Cropper

Status: source present and unreleased. No Stable, pixel-export, image-security, package-parity, or manual Risk Class 3 claim is made.

`ImageCropper` owns only a normalized crop plan: pointer capture, mirrored arrow-key movement, source-aware aspect-ratio geometry, native zoom, controlled or uncontrolled state, disabled-aware JSON form serialization, and reset. It preserves the source and explicitly leaves image decoding and pixel export to a consumer pipeline. Optional numeric controls provide exact non-spatial editing, a labelled preview reflects the real crop rectangle and zoom, and rule-of-thirds guides support composition; each enhancement can be removed independently with its UI and semantics.

Consumers must validate and authorize image bytes, account for EXIF orientation and color profiles, manage decode/export memory, strip unsafe metadata where policy requires it, and keep the original recoverable.

The workbench stage uses a literal Canvas, an Ink frame, white crop boundary, Green range control, Violet preview seam, shared focus geometry, bounded corners, logical coordinates, a single-column narrow adaptation, and forced-color guides that disappear without removing capability.
