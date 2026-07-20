import { pageMetadata } from "../site-origin";
import { StudioWorkbench } from "./studio-workbench";

export const metadata = pageMetadata({
  description:
    "Edit guarded Mergora semantic tokens, inspect the public state rail, and round-trip checked local exports without uploading data.",
  pathname: "/studio",
  title: "Studio",
});

export default function StudioPage() {
  return (
    <main className="studio-page" id="main-content">
      <header>
        <p className="site-eyebrow">Mergora Studio · local only</p>
        <h1>Edit the system, not each component.</h1>
        <p>
          Edit semantic roles before primitives, inspect continuous guardrails across a public
          component state rail, and export every editable value as DTCG, CSS, Tailwind, TypeScript,
          or Mergora design-tool interchange. Each format carries a versioned, checksummed state and
          context envelope that Studio can validate before an atomic local restore. Share state
          stays in a URL fragment and no preset is sent to a server.
        </p>
      </header>
      <StudioWorkbench />
    </main>
  );
}
