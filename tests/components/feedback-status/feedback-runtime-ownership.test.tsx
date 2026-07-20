import { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Callout,
  type CalloutProps,
} from "../../../registry/source/components/callout/callout.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  Skeleton,
  type SkeletonProps,
} from "../../../registry/source/components/skeleton/skeleton.tsx";
import { Status, type StatusProps } from "../../../registry/source/components/status/status.tsx";

describe("P2 feedback runtime semantic ownership", () => {
  it("rejects semantic overrides from untyped JavaScript callers", () => {
    const calloutOverride = { role: "alert" } as unknown as CalloutProps;
    const statusOverride = { "aria-label": "Replacement" } as unknown as StatusProps;
    const skeletonOverride = { "aria-hidden": false } as unknown as SkeletonProps;
    const skeletonChildren = { children: "LEAK" } as unknown as SkeletonProps;

    expect(() =>
      renderToStaticMarkup(
        <Callout {...calloutOverride} title="Owned semantics">
          Body
        </Callout>,
      ),
    ).toThrow("Callout owns role");
    expect(() => renderToStaticMarkup(<Status {...statusOverride}>Ready</Status>)).toThrow(
      "Status owns aria-label",
    );
    expect(() => renderToStaticMarkup(<Skeleton {...skeletonOverride} />)).toThrow(
      "Skeleton owns aria-hidden",
    );
    expect(() => renderToStaticMarkup(<Skeleton {...skeletonChildren} />)).toThrow(
      "Skeleton owns children",
    );
  });

  it("rejects empty boolean, array, and Fragment content", () => {
    expect(() =>
      renderToStaticMarkup(
        <Callout title={<Fragment />}>{[false, null, <Fragment key="empty" />]}</Callout>,
      ),
    ).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(
        <Status>
          <Fragment>{[false, null, undefined]}</Fragment>
        </Status>,
      ),
    ).toThrow("non-empty");
  });

  it("localizes status punctuation and preserves an explicit complete cue", () => {
    const localized = renderToStaticMarkup(
      <MergoraProvider
        locale="ja-JP"
        messages={{
          "status.variantLabel": ({ values }) => `【${String(values.variant)}】`,
          "status.warning": "警告",
        }}
      >
        <Status variant="warning">確認待ち</Status>
      </MergoraProvider>,
    );
    expect(localized).toContain("【警告】");
    expect(localized).not.toContain("警告:");

    const explicit = renderToStaticMarkup(
      <Status variant="warning" variantLabel="Achtung —">
        Prüfung ausstehend
      </Status>,
    );
    expect(explicit).toContain("Achtung —");
    expect(explicit).not.toContain("Achtung —:");
  });
});
