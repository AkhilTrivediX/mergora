import { resolve } from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

interface FileSpec {
  readonly lastModified?: number;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly mode?: "directory" | "file" | "text" | "unreadable";
}

interface SelectionSummary {
  readonly accepted: readonly {
    readonly name: string;
    readonly size: number;
    readonly type: string;
  }[];
  readonly rejected: readonly {
    readonly name: string;
    readonly reason: string;
    readonly size?: number;
    readonly type?: string;
  }[];
  readonly source: "drop" | "paste" | "picker";
}

function guardRuntime(page: Page): string[] {
  const failures: string[] = [];
  runtimeFailures.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      if (
        message.type() === "warning" &&
        message.text().includes("Layout was forced before the page was fully loaded") &&
        message.text().includes("chrome://juggler/")
      ) {
        return;
      }
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ page }) => {
  guardRuntime(page);
});

test.afterEach(({ page }) => {
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string, heading: string | RegExp): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-file-systems--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    throw new Error("Axe remained busy for five seconds.");
  });
}

async function readSelection(page: Page): Promise<SelectionSummary> {
  return JSON.parse((await page.getByTestId("dropzone-result").textContent()) ?? "{}") as
    SelectionSummary | never;
}

async function dispatchFiles(
  page: Page,
  source: "drop" | "paste",
  specs: readonly FileSpec[],
): Promise<boolean> {
  return page.evaluate(
    ({ input, sourceKind }) => {
      const root = document.querySelector<HTMLElement>('[data-slot="dropzone"]');
      const surface = document.querySelector<HTMLElement>(".mrg-dropzone-surface");
      if (root === null || surface === null) throw new Error("Dropzone specimen is missing.");
      const createFile = ({ lastModified, name, size, type }: FileSpec) =>
        new File([new Uint8Array(size)], name, {
          ...(lastModified === undefined ? {} : { lastModified }),
          type,
        });

      if (sourceKind === "paste") {
        const transfer = new DataTransfer();
        for (const spec of input) transfer.items.add(createFile(spec));
        const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: transfer });
        const keyboardTarget = surface.querySelector<HTMLButtonElement>("button");
        if (keyboardTarget === null) throw new Error("Dropzone keyboard target is missing.");
        keyboardTarget.focus();
        keyboardTarget.dispatchEvent(event);
        return event.defaultPrevented;
      }

      const items = input.map((spec) => {
        const mode = spec.mode ?? "file";
        if (mode === "directory") {
          return {
            getAsFile: () => null,
            kind: "file",
            type: "",
            webkitGetAsEntry: () => ({
              createReader: () => ({ readEntries: () => undefined }),
              isDirectory: true,
              isFile: false,
              name: spec.name,
            }),
          };
        }
        if (mode === "text") {
          return { getAsString: () => undefined, kind: "string", type: spec.type };
        }
        const file = createFile(spec);
        if (mode === "unreadable") {
          const unreadable = new Proxy(file, {
            get(target, key) {
              if (key === "then") {
                return (_resolve: unknown, reject: (reason: Error) => void) =>
                  reject(new Error("Unreadable browser fixture"));
              }
              return Reflect.get(target, key, target) as unknown;
            },
          });
          return {
            getAsFile: () => unreadable,
            kind: "file",
            type: spec.type,
            webkitGetAsEntry: () => ({ isDirectory: false, isFile: true, name: spec.name }),
          };
        }
        return {
          getAsFile: () => file,
          kind: "file",
          type: spec.type,
          webkitGetAsEntry: () => ({ isDirectory: false, isFile: true, name: spec.name }),
        };
      });
      const transfer = {
        dropEffect: "none",
        effectAllowed: "all",
        files: [],
        getData: (type: string) => (type === "text/plain" ? "Unsupported text" : ""),
        items,
        types: items.some((item) => item.kind === "file") ? ["Files"] : ["text/plain"],
      };
      const dispatch = (type: "dragenter" | "drop") => {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 20,
        });
        Object.defineProperty(event, "dataTransfer", { value: transfer });
        surface.dispatchEvent(event);
        return event;
      };
      dispatch("dragenter");
      return dispatch("drop").defaultPrevented;
    },
    { input: specs, sourceKind: source },
  );
}

function withoutSource(summary: SelectionSummary): Omit<SelectionSummary, "source"> {
  const { source: _source, ...rest } = summary;
  return rest;
}

test("native file input preserves picker, multiple, form, reset, disabled, keyboard, and axe behavior", async ({
  page,
}) => {
  await openStory(page, "native-file-input-and-form", "Native file selection and form reset");
  const form = page.getByRole("form", { name: "Native file form workbench" });
  const input = form.locator('input[type="file"][name="evidence"]');
  const disabled = form.locator('input[type="file"][name="archived-evidence"]');
  await expect(input).toHaveAccessibleName("Choose evidence files");
  await expect(input).toHaveAttribute("accept", ".pdf,image/*");
  await expect(input).toHaveAttribute("multiple", "");
  await expect(input).toHaveAccessibleDescription(/native input remains the successful form/u);
  await expect(disabled).toBeDisabled();

  const chooserPromise = page.waitForEvent("filechooser");
  await input.focus();
  await expect(input).toBeFocused();
  await input.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles([
    { buffer: Buffer.from("pdf"), mimeType: "application/pdf", name: "audit.PDF" },
    { buffer: Buffer.from("png"), mimeType: "image/png", name: "preview.png" },
  ]);
  expect(JSON.parse((await page.getByTestId("native-selection").textContent()) ?? "[]")).toEqual([
    { name: "audit.PDF", size: 3, type: "application/pdf" },
    { name: "preview.png", size: 3, type: "image/png" },
  ]);

  await form.getByRole("button", { name: "Inspect file form values" }).click();
  expect(JSON.parse((await page.getByTestId("native-form-output").textContent()) ?? "{}")).toEqual({
    disabledPresent: false,
    evidence: [
      { name: "audit.PDF", size: 3, type: "application/pdf" },
      { name: "preview.png", size: 3, type: "image/png" },
    ],
  });

  await form.getByRole("button", { name: "Clear native file selection" }).click();
  await expect(page.getByTestId("native-selection")).toHaveText("Native reset requested");
  expect(await input.evaluate((element) => (element as HTMLInputElement).files?.length)).toBe(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("plain mode removes optional guidance, size rejection, byte context, and live announcements", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Plain file controls");
  const plainPicker = page.locator('[aria-label="Plain file picker"] input[type="file"]');
  const dropPicker = page.locator('[aria-label="Plain dropzone"] .mrg-dropzone input[type="file"]');
  await expect(plainPicker).not.toHaveAttribute("accept");
  await expect(dropPicker).not.toHaveAttribute("accept");
  await dropPicker.setInputFiles({
    buffer: Buffer.from("larger than the disabled one-byte preflight"),
    mimeType: "text/plain",
    name: "notes.txt",
  });
  const plainDropzone = page.getByRole("region", { name: "Plain dropzone" });
  const plainProgress = page.getByRole("region", { name: "Plain upload progress" });
  await expect(plainDropzone.locator('[data-slot="dropzone-status"]')).toHaveText("1 file ready.");
  await expect(plainProgress.locator('[data-slot="upload-progress-announcement"]')).toHaveCount(0);
  await expect(plainProgress.getByRole("progressbar", { name: "File upload" })).toHaveAttribute(
    "aria-valuetext",
    "40%",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("recommended mode exposes each independently controlled Mergora enhancement", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora", "Mergora file-selection workbench");
  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs.first()).toHaveAttribute("accept", ".pdf,image/*");
  await expect(
    page.locator(
      'section[aria-labelledby="dropzone-workbench-heading"] .mrg-dropzone input[type="file"]',
    ),
  ).toHaveAttribute("accept", ".pdf,image/*");
  const progressWorkbench = page.locator('section[aria-labelledby="upload-workbench-heading"]');
  await expect(progressWorkbench.locator('[data-slot="upload-progress-announcement"]')).toHaveCount(
    1,
  );
  await expect(
    progressWorkbench.getByRole("progressbar", { name: "design-system-audit.pdf" }),
  ).toHaveAttribute("aria-valuetext", /MiB/u);
  expect(await axeViolations(page)).toEqual([]);
});

test("plain composite mode omits preview, recovery, queue actions, progress, and avatar lifecycle", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Plain file controls");
  const fileUpload = page.locator('[data-slot="file-upload"]');
  await expect(fileUpload).toHaveCount(1);
  await expect(fileUpload.locator('[data-slot="file-upload-preview"]')).toHaveCount(0);
  await expect(fileUpload.locator('[data-slot="file-upload-actions"]')).toHaveCount(0);
  await expect(fileUpload.locator('[data-slot="file-upload-rejections"]')).toHaveCount(0);
  await expect(fileUpload.locator('[data-slot="upload-progress"]')).toHaveCount(0);
  const avatar = page.locator('[data-slot="avatar-upload"]');
  await expect(avatar).toHaveCount(1);
  await expect(avatar.locator('[data-slot="avatar-upload-preview"]')).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-upload-preview-status"]')).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-upload-metadata"]')).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-upload-actions"]')).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-upload-lifecycle"]')).toHaveCount(0);
  await expect(avatar.locator('[data-slot="avatar-upload-rejection"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("file queue applies duplicate recovery, accessible ordering, and consumer lifecycle callbacks", async ({
  page,
}) => {
  await openStory(
    page,
    "file-upload-queue-workbench",
    "File queue preflight and consumer lifecycle",
  );
  const upload = page.locator('[data-slot="file-upload"]');
  await expect(upload.locator('[data-slot="file-upload-item"]')).toHaveCount(2);
  await expect(upload.getByRole("progressbar")).toHaveCount(2);
  await expect(upload.locator('[data-slot="file-upload-preview"]')).toHaveCount(2);

  expect(
    await dispatchFiles(page, "paste", [
      {
        lastModified: 1_700_000_000_000,
        name: "new-diagram.png",
        size: 3,
        type: "image/png",
      },
      {
        lastModified: 1_700_000_000_000,
        name: "new-diagram.png",
        size: 3,
        type: "image/png",
      },
      { name: "notes.txt", size: 3, type: "text/plain" },
      { name: "oversized.pdf", size: 1025, type: "application/pdf" },
    ]),
  ).toBe(true);
  await expect(upload.locator('[data-slot="file-upload-item"]')).toHaveCount(3);
  await expect(page.getByTestId("file-upload-selection")).toContainText('"reason":"duplicate"');
  await expect(page.getByTestId("file-upload-selection")).toContainText('"reason":"file-type"');
  await expect(page.getByTestId("file-upload-selection")).toContainText(
    '"reason":"file-too-large"',
  );
  await expect(upload.locator('[data-slot="file-upload-rejections"] li')).toHaveCount(3);

  const newItem = upload
    .locator('[data-slot="file-upload-item"]')
    .filter({ hasText: "new-diagram.png" });
  await newItem.getByRole("button", { name: /earlier in the queue/u }).click();
  await expect(upload.locator('[data-slot="file-upload-item"] strong').nth(1)).toHaveText(
    "new-diagram.png",
  );

  const failed = upload
    .locator('[data-slot="file-upload-item"]')
    .filter({ hasText: "interface-notes.pdf" });
  await failed.getByRole("button", { name: "Retry interface-notes.pdf" }).click();
  await expect(failed).toHaveAttribute("data-status", "retrying");
  const active = upload
    .locator('[data-slot="file-upload-item"]')
    .filter({ hasText: "component-map.png" });
  await active.getByRole("button", { name: "Cancel component-map.png" }).click();
  await expect(active).toHaveAttribute("data-status", "cancelled");
  await newItem.getByRole("button", { name: "Remove new-diagram.png" }).click();
  await expect(upload.locator('[data-slot="file-upload-item"]')).toHaveCount(2);
  expect(await axeViolations(page)).toEqual([]);
});

test("avatar preview revokes owned URLs and exposes only enabled edit, recovery, progress, retry, and removal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const nativeCreate = URL.createObjectURL.bind(URL);
    const nativeRevoke = URL.revokeObjectURL.bind(URL);
    Object.defineProperty(globalThis, "__avatarUrls", { value: { created, revoked } });
    URL.createObjectURL = (blob) => {
      const url = nativeCreate(blob);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      nativeRevoke(url);
    };
  });
  await openStory(
    page,
    "avatar-upload-lifecycle-workbench",
    "Avatar preview and consumer lifecycle",
  );
  const avatar = page.locator('[data-slot="avatar-upload"]');
  await expect(avatar.locator('[data-slot="avatar-upload-preview"]')).toBeVisible();
  await expect(avatar.locator('[data-slot="avatar-upload-preview"]')).toHaveAttribute(
    "alt",
    "Preview of profile-mark.svg",
  );
  await expect(avatar.locator('[data-slot="avatar-upload-metadata"]')).toContainText(
    "profile-mark.svg",
  );
  await expect(avatar.getByRole("progressbar", { name: "profile-mark.svg" })).toBeVisible();
  await avatar.getByRole("button", { name: "Edit image" }).click();
  await expect(page.getByTestId("avatar-upload-activity")).toContainText("Edit requested");
  await avatar.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByTestId("avatar-upload-activity")).toContainText("Retry requested");

  const input = avatar.locator('input[type="file"]');
  await input.setInputFiles({
    buffer: Buffer.from("text"),
    mimeType: "text/plain",
    name: "notes.txt",
  });
  await expect(avatar.locator('[data-slot="avatar-upload-rejection"]')).toContainText(
    "supported image",
  );
  expect(await input.evaluate((element) => (element as HTMLInputElement).files?.length)).toBe(0);
  await input.setInputFiles({
    buffer: Buffer.from("image"),
    mimeType: "image/png",
    name: "replacement.png",
  });
  await expect(avatar.locator('[data-slot="avatar-upload-preview"]')).toHaveAttribute(
    "alt",
    "Preview of replacement.png",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __avatarUrls: { created: string[]; revoked: string[] };
            }
          ).__avatarUrls.revoked.length,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  await avatar.getByRole("button", { name: "Remove image" }).click();
  await expect(avatar.locator('[data-slot="avatar-upload-preview"]')).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __avatarUrls: { created: string[]; revoked: string[] };
            }
          ).__avatarUrls.revoked.length,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  expect(await axeViolations(page)).toEqual([]);
});

test("picker, paste, and drop apply identical size, type, count, and accepted-file classification", async ({
  page,
}) => {
  await openStory(
    page,
    "picker-paste-and-drop-parity",
    "Picker, paste, and drop share one acceptance contract",
  );
  const specs = [
    { name: "oversized.jpg", size: 1025, type: "image/jpeg" },
    { name: "notes.txt", size: 4, type: "text/plain" },
    { name: "preview.png", size: 3, type: "image/png" },
    { name: "audit.pdf", size: 3, type: "application/pdf" },
    { name: "extra.png", size: 3, type: "image/png" },
  ] as const;
  const input = page.locator('.mrg-dropzone input[type="file"]');
  await input.setInputFiles(
    specs.map(({ name, size, type }) => ({ buffer: Buffer.alloc(size), mimeType: type, name })),
  );
  const picker = await readSelection(page);
  expect(picker.source).toBe("picker");
  expect(picker.accepted.map(({ name }) => name)).toEqual(["preview.png", "audit.pdf"]);
  expect(picker.rejected.map(({ name, reason }) => [name, reason])).toEqual([
    ["oversized.jpg", "file-too-large"],
    ["notes.txt", "file-type"],
    ["extra.png", "file-count"],
  ]);

  expect(await dispatchFiles(page, "paste", specs)).toBe(true);
  await expect(page.getByTestId("dropzone-result")).toContainText('"source":"paste"');
  await expect(page.getByTestId("dropzone-history-count")).toHaveText("Completed requests: 2");
  const paste = await readSelection(page);
  expect(withoutSource(paste)).toEqual(withoutSource(picker));

  expect(await dispatchFiles(page, "drop", specs)).toBe(true);
  await expect(page.getByTestId("dropzone-result")).toContainText('"source":"drop"');
  await expect(page.getByTestId("dropzone-history-count")).toHaveText("Completed requests: 3");
  const drop = await readSelection(page);
  expect(withoutSource(drop)).toEqual(withoutSource(picker));
  expect(await axeViolations(page)).toEqual([]);
});

test("native FormData synchronizes default, controlled, picker, paste, drop, remove, and reset without synthetic file events", async ({
  page,
}) => {
  await openStory(
    page,
    "form-serialization-and-reset",
    "Accepted files stay synchronized with native FormData",
  );
  const form = page.getByRole("form", { name: "Synchronized file form" });
  const readForm = () =>
    form.evaluate((element) => {
      const data = new FormData(element as HTMLFormElement);
      return Object.fromEntries(
        ["evidence", "queued-files", "default-avatar", "controlled-avatar"].map((field) => [
          field,
          data
            .getAll(field)
            .filter((entry): entry is File => entry instanceof File && entry.name.length > 0)
            .map((entry) => entry.name),
        ]),
      );
    });

  await expect.poll(readForm).toEqual({
    "controlled-avatar": ["controlled-initial.png"],
    "default-avatar": ["default-initial.png"],
    evidence: [],
    "queued-files": ["queue-initial.pdf"],
  });

  await page.evaluate(() => {
    Object.defineProperty(globalThis, "__fileEvents", {
      configurable: true,
      value: { change: 0, input: 0 },
      writable: true,
    });
    Object.defineProperty(globalThis, "__fileEventDetails", {
      configurable: true,
      value: [] as string[],
      writable: true,
    });
    document.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "file") {
        (
          globalThis as unknown as { __fileEvents: { change: number; input: number } }
        ).__fileEvents.change += 1;
        (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails.push(
          `${event.type}:${event.target.name}:${event.isTrusted ? "trusted" : "untrusted"}`,
        );
      }
    });
    document.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "file") {
        (
          globalThis as unknown as { __fileEvents: { change: number; input: number } }
        ).__fileEvents.input += 1;
        (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails.push(
          `${event.type}:${event.target.name}:${event.isTrusted ? "trusted" : "untrusted"}`,
        );
      }
    });
  });
  await form.getByRole("button", { name: "Replace controlled avatar externally" }).click();
  await expect.poll(readForm).toEqual({
    "controlled-avatar": ["controlled-external.png"],
    "default-avatar": ["default-initial.png"],
    evidence: [],
    "queued-files": ["queue-initial.pdf"],
  });
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents,
    ),
  ).toEqual({ change: 0, input: 0 });
  await form.getByRole("button", { name: "Replace controlled queue externally" }).click();
  await expect.poll(readForm).toMatchObject({ "queued-files": ["queue-external.pdf"] });
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents,
    ),
  ).toEqual({ change: 0, input: 0 });

  const evidenceInput = form.locator('.mrg-dropzone input[type="file"][name="evidence"]');
  await evidenceInput.setInputFiles([
    { buffer: Buffer.from("pdf"), mimeType: "application/pdf", name: "accepted.pdf" },
    { buffer: Buffer.from("text"), mimeType: "text/plain", name: "rejected.txt" },
  ]);
  await expect(page.getByTestId("form-drop-result")).toContainText('"formDataSynchronized":true');
  await expect.poll(readForm).toMatchObject({ evidence: ["accepted.pdf"] });
  await page.waitForTimeout(50);

  await page.evaluate(() => {
    (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents = {
      change: 0,
      input: 0,
    };
    (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails = [];
  });
  const directAssignmentEvents = await evidenceInput.evaluate((element) => {
    const events: string[] = [];
    element.addEventListener("input", (event) => events.push(event.type), { once: true });
    element.addEventListener("change", (event) => events.push(event.type), { once: true });
    const transfer = new DataTransfer();
    transfer.items.add(new File(["direct"], "direct.pdf", { type: "application/pdf" }));
    (element as HTMLInputElement).files = transfer.files;
    return events;
  });
  expect(directAssignmentEvents).toEqual([]);
  const directClearingEvents = await evidenceInput.evaluate((element) => {
    const events: string[] = [];
    element.addEventListener("input", (event) => events.push(event.type), { once: true });
    element.addEventListener("change", (event) => events.push(event.type), { once: true });
    (element as HTMLInputElement).value = "";
    return events;
  });
  expect(directClearingEvents).toEqual([]);
  await page.evaluate(() => {
    (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents = {
      change: 0,
      input: 0,
    };
    (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails = [];
  });
  expect(
    await dispatchFiles(page, "paste", [
      { name: "pasted.png", size: 3, type: "image/png" },
      { name: "pasted.txt", size: 3, type: "text/plain" },
    ]),
  ).toBe(true);
  await expect.poll(readForm).toMatchObject({ evidence: ["pasted.png"] });
  await page.evaluate(() => {
    (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents = {
      change: 0,
      input: 0,
    };
    (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails = [];
  });

  expect(
    await dispatchFiles(page, "drop", [
      { name: "dropped.pdf", size: 3, type: "application/pdf" },
      { name: "dropped.txt", size: 3, type: "text/plain" },
    ]),
  ).toBe(true);
  await expect.poll(readForm).toMatchObject({ evidence: ["dropped.pdf"] });

  const controlledAvatar = form.locator('input[type="file"][name="controlled-avatar"]');
  await controlledAvatar.setInputFiles({
    buffer: Buffer.from("selected"),
    mimeType: "image/png",
    name: "controlled-selected.png",
  });
  await expect.poll(readForm).toMatchObject({
    "controlled-avatar": ["controlled-selected.png"],
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents = {
      change: 0,
      input: 0,
    };
    (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails = [];
  });
  const controlledRoot = controlledAvatar.locator("xpath=ancestor::*[@data-slot='avatar-upload']");
  await controlledRoot.getByRole("button", { name: "Remove image" }).click();
  await expect.poll(readForm).toMatchObject({ "controlled-avatar": [] });
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __fileEventDetails: string[] }).__fileEventDetails,
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { __fileEvents: { change: number; input: number } }).__fileEvents,
    ),
  ).toEqual({ change: 0, input: 0 });

  await form.getByRole("button", { name: "Reset synchronized form" }).click();
  await expect(form.locator('.mrg-dropzone [data-slot="dropzone-status"]').first()).toHaveText(
    "No files selected.",
  );
  await expect.poll(readForm).toEqual({
    "controlled-avatar": [],
    "default-avatar": [],
    evidence: [],
    "queued-files": [],
  });
  expect(await axeViolations(page)).toEqual([]);
});

test("drop materialization reports directory, unsupported, unreadable, 100-item cap, and latest request", async ({
  page,
}) => {
  await openStory(
    page,
    "picker-paste-and-drop-parity",
    "Picker, paste, and drop share one acceptance contract",
  );
  expect(
    await dispatchFiles(page, "drop", [
      { mode: "directory", name: "evidence-folder", size: 0, type: "" },
      { mode: "text", name: "clipboard-text", size: 0, type: "text/plain" },
      { mode: "unreadable", name: "locked.pdf", size: 3, type: "application/pdf" },
      { name: "ready.pdf", size: 3, type: "application/pdf" },
    ]),
  ).toBe(true);
  await expect(page.getByTestId("dropzone-history-count")).toHaveText("Completed requests: 1");
  let result = await readSelection(page);
  expect(result.accepted.map(({ name }) => name)).toEqual(["ready.pdf"]);
  expect(result.rejected.map(({ name, reason }) => [name, reason])).toEqual([
    ["evidence-folder", "directory-not-supported"],
    ["locked.pdf", "unreadable"],
    ["Non-file item", "unsupported-item"],
  ]);

  await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".mrg-dropzone-surface");
    if (surface === null) throw new Error("Dropzone surface is missing.");
    const dispatch = (name: string, unreadable: boolean) => {
      const file = new File(["pdf"], name, { type: "application/pdf" });
      const candidate = unreadable
        ? new Proxy(file, {
            get(target, key) {
              if (key === "then") {
                return (_resolve: unknown, reject: (reason: Error) => void) =>
                  reject(new Error("Stale unreadable fixture"));
              }
              return Reflect.get(target, key, target) as unknown;
            },
          })
        : file;
      const item = {
        getAsFile: () => candidate,
        kind: "file",
        type: "application/pdf",
        webkitGetAsEntry: () => ({ isDirectory: false, isFile: true, name }),
      };
      const transfer = {
        dropEffect: "none",
        effectAllowed: "all",
        files: [],
        getData: () => "",
        items: [item],
        types: ["Files"],
      };
      for (const type of ["dragenter", "drop"] as const) {
        const event = new DragEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: transfer });
        surface.dispatchEvent(event);
      }
    };
    dispatch("stale.pdf", true);
    dispatch("latest.pdf", false);
  });
  await expect(page.getByTestId("dropzone-history-count")).toHaveText("Completed requests: 2");
  result = await readSelection(page);
  expect(result.accepted.map(({ name }) => name)).toEqual(["latest.pdf"]);
  expect(result.rejected).toEqual([]);

  const input = page.locator('.mrg-dropzone input[type="file"]');
  await input.setInputFiles(
    Array.from({ length: 101 }, (_, index) => ({
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
      name: `evidence-${String(index).padStart(3, "0")}.pdf`,
    })),
  );
  result = await readSelection(page);
  expect(result.accepted).toHaveLength(2);
  expect(result.rejected).toHaveLength(99);
  expect(result.rejected.at(-1)).toEqual({ name: "1 additional items", reason: "file-count" });
});

test("progress formats bytes and throttles announcements by bucket while status changes announce", async ({
  page,
}) => {
  await openStory(
    page,
    "upload-announcement-workbench",
    "Upload announcements stay useful under rapid progress",
  );
  const progress = page.getByRole("progressbar", { name: "design-system-audit.pdf" });
  const announcement = page.locator('[data-slot="upload-progress-announcement"]');
  await expect(progress).toHaveAttribute("value", "12");
  await expect(progress).toHaveAttribute("aria-valuetext", "12%, 1.2 MiB of 10 MiB");
  await expect(announcement).toHaveText("Uploading: 12%, 1.2 MiB of 10 MiB");

  await page.getByRole("button", { name: "Advance within bucket" }).click();
  await expect(progress).toHaveAttribute("aria-valuetext", "18%, 1.8 MiB of 10 MiB");
  await expect(announcement).toHaveText("Uploading: 12%, 1.2 MiB of 10 MiB");

  await page.getByRole("button", { name: "Cross next bucket" }).click();
  await expect(announcement).toHaveText("Uploading: 21%, 2.1 MiB of 10 MiB");
  await page.getByRole("button", { name: "Pause upload" }).click();
  await expect(announcement).toHaveText("Upload paused: 21%, 2.1 MiB of 10 MiB");
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(progress).not.toHaveAttribute("value");
  await expect(announcement).toHaveText("Retrying upload: 21%, 2.1 MiB of 10 MiB");
  await page.getByRole("button", { name: "Complete upload" }).click();
  await expect(progress).toHaveAttribute("value", "100");
  await expect(announcement).toHaveText("Upload complete: 100%, 10 MiB of 10 MiB");
  expect(await axeViolations(page)).toEqual([]);
});

test("state rail and 320px RTL remain accessible under forced colors and reduced motion", async ({
  page,
}) => {
  await openStory(page, "state-matrix", "File-system and upload adverse-state rail");
  await expect(page.locator('[data-slot="file-trigger-control"][directory]')).toHaveAttribute(
    "multiple",
    "",
  );
  await expect(page.locator('[data-slot="file-trigger-control"][capture]')).toHaveAttribute(
    "capture",
    "environment",
  );
  await expect(page.getByRole("button", { name: /Archived evidence intake/u })).toBeDisabled();
  await expect(page.locator('[data-slot="upload-progress"]')).toHaveCount(9);
  expect(await axeViolations(page)).toEqual([]);

  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "right-to-left-and-narrow", /تحميل الملفات/u);
  const provider = page.locator('[data-slot="provider"]');
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  const fileControl = page.locator('[data-slot="file-trigger-control"]').first();
  const fileLabel = page.locator('[data-slot="file-trigger-label"]').first();
  await fileControl.focus();
  await expect(fileControl).toBeFocused();
  expect(await fileLabel.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
  expect(await fileLabel.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  const dropzoneSurface = page.locator(".mrg-dropzone-surface").first();
  const dropzoneKeyboardTarget = dropzoneSurface.getByRole("button", { name: /^DropZone /u });
  await dropzoneKeyboardTarget.focus();
  await expect(dropzoneKeyboardTarget).toBeFocused();
  await expect(dropzoneSurface).toHaveAttribute("data-focus-visible");
  expect(await dropzoneSurface.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
  expect(await dropzoneSurface.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe(
    "none",
  );
  const undersized = await page
    .locator('[data-slot="file-trigger-label"], .mrg-dropzone-surface')
    .evaluateAll((targets) =>
      targets
        .map((target) => {
          const box = target.getBoundingClientRect();
          return { height: box.height, slot: target.getAttribute("data-slot"), width: box.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("coarse-pointer touch activates the real native picker with a preferred target", async ({
  baseURL,
  browser,
}) => {
  if (baseURL === undefined) throw new Error("The file-system browser suite requires a base URL.");
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL, hasTouch: true });
  const touchPage = await context.newPage();
  const failures = guardRuntime(touchPage);
  try {
    await openStory(
      touchPage,
      "native-file-input-and-form",
      "Native file selection and form reset",
    );
    expect(await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const label = touchPage.locator('[data-slot="file-trigger-label"]').first();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    const chooserPromise = touchPage.waitForEvent("filechooser");
    await label.tap();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
      name: "touch-evidence.pdf",
    });
    await expect(touchPage.getByTestId("native-selection")).toContainText("touch-evidence.pdf");
    expect(await axeViolations(touchPage)).toEqual([]);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
