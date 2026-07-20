import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  AvatarUpload,
  type AvatarUploadChangeReason,
} from "../../../registry/source/components/avatar-upload/avatar-upload.tsx";
import {
  Dropzone,
  type FileRejectionReason,
  type FileSelectionResult,
} from "../../../registry/source/components/dropzone/dropzone.tsx";
import {
  FileTrigger,
  type FileCaptureMode,
} from "../../../registry/source/components/file-trigger/file-trigger.tsx";
import {
  FileUpload,
  type FileUploadChangeReason,
  type FileUploadItem,
  type FileUploadSelectionResult,
} from "../../../registry/source/components/file-upload/file-upload.tsx";
import {
  UploadProgress,
  type UploadProgressScope,
  type UploadProgressStatus,
} from "../../../registry/source/components/upload-progress/upload-progress.tsx";

const inputRef = createRef<HTMLInputElement>();
const regionRef = createRef<HTMLDivElement>();

<FileTrigger
  acceptDirectory
  acceptedFileTypes={[".pdf", "image/*"]}
  allowsMultiple
  capture={"environment" satisfies FileCaptureMode}
  label="Choose files"
  onSelect={(files, event) => {
    expectTypeOf(files).toEqualTypeOf<readonly File[]>();
    expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLInputElement>();
  }}
  ref={inputRef}
/>;

<Dropzone
  acceptedFileTypes={["application/pdf"]}
  label="Evidence"
  onFiles={(result: FileSelectionResult) => {
    expectTypeOf(result.source).toEqualTypeOf<"drop" | "paste" | "picker">();
  }}
  ref={regionRef}
  validateFileSize={false}
/>;

<UploadProgress
  announceProgress={false}
  label="Evidence upload"
  ref={regionRef}
  scope={"aggregate" satisfies UploadProgressScope}
  status={"retrying" satisfies UploadProgressStatus}
/>;

<FileUpload
  duplicatePolicy="reject"
  form="evidence-form"
  items={[] satisfies readonly FileUploadItem[]}
  label="Evidence files"
  name="evidence"
  onItemsChange={(items, detail) => {
    expectTypeOf(items).toEqualTypeOf<readonly FileUploadItem[]>();
    expectTypeOf(detail.reason).toEqualTypeOf<FileUploadChangeReason>();
  }}
  onSelection={(result: FileUploadSelectionResult) => {
    expectTypeOf(result.source).toEqualTypeOf<"drop" | "paste" | "picker">();
  }}
  ref={regionRef}
  required
/>;

<AvatarUpload
  label="Profile image"
  name="avatar"
  onValueChange={(file, detail) => {
    expectTypeOf(file).toEqualTypeOf<File | null>();
    expectTypeOf(detail.reason).toEqualTypeOf<AvatarUploadChangeReason>();
  }}
  ref={regionRef}
  value={null}
/>;

const rejection: FileRejectionReason = "unreadable";
expectTypeOf(rejection).toMatchTypeOf<FileRejectionReason>();

// @ts-expect-error FileTrigger owns its native file input type.
<FileTrigger label="Files" type="text" />;

// @ts-expect-error FileTrigger owns native change handling through onSelect.
<FileTrigger label="Files" onChange={() => undefined} />;

// @ts-expect-error FileTrigger capture is deliberately limited to standard camera modes.
<FileTrigger capture="microphone" label="Files" />;

// @ts-expect-error Dropzone requires one result callback.
<Dropzone label="Evidence" />;

// @ts-expect-error Dropzone owns native drop handling.
<Dropzone label="Evidence" onDrop={() => undefined} onFiles={() => undefined} />;

// @ts-expect-error UploadProgress does not accept arbitrary children.
<UploadProgress label="Upload">Unexpected child</UploadProgress>;

// @ts-expect-error Upload status is a closed state machine.
<UploadProgress label="Upload" status="pending" />;

// @ts-expect-error FileUpload owns its queue change protocol.
<FileUpload label="Files" onChange={() => undefined} />;

// @ts-expect-error FileUpload items require FileUploadItem records.
<FileUpload items={[new File([], "raw.txt")]} label="Files" />;

// @ts-expect-error AvatarUpload value is a File or null.
<AvatarUpload label="Avatar" value="profile.png" />;

// @ts-expect-error AvatarUpload owns native input change through onValueChange.
<AvatarUpload label="Avatar" onChange={() => undefined} />;

describe("P4 file-system type surface", () => {
  it("keeps native and region refs exact", () => {
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
    expectTypeOf(regionRef.current).toEqualTypeOf<HTMLDivElement | null>();
  });
});
