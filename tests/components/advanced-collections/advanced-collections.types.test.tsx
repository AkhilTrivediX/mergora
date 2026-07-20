import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  Autocomplete,
  type AutocompleteProps,
} from "../../../registry/source/components/autocomplete/index.ts";
import {
  CommandPalette,
  type CommandPaletteProps,
} from "../../../registry/source/components/command-palette/index.ts";
import {
  CreatableSelect,
  type CreatableSelectProps,
} from "../../../registry/source/components/creatable-select/index.ts";
import {
  MentionField,
  type MentionFieldProps,
} from "../../../registry/source/components/mention-field/index.ts";
import {
  MultiSelect,
  type MultiSelectProps,
} from "../../../registry/source/components/multi-select/index.ts";
import {
  TagsInput,
  type TagsInputProps,
} from "../../../registry/source/components/tags-input/index.ts";
import {
  TransferList,
  type TransferListProps,
} from "../../../registry/source/components/transfer-list/index.ts";

describe("advanced collection public types", () => {
  it("exports precise refs and component-specific enhancement props", () => {
    expectTypeOf(
      <Autocomplete label="Area" options={[]} ref={createRef<HTMLInputElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <CommandPalette
        commands={[]}
        label="Commands"
        onCommand={() => undefined}
        ref={createRef<HTMLDivElement>()}
      />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <CreatableSelect label="Area" options={[]} ref={createRef<HTMLInputElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <MentionField label="Note" options={[]} ref={createRef<HTMLTextAreaElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <MultiSelect label="Areas" options={[]} ref={createRef<HTMLDivElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <TagsInput label="Tags" ref={createRef<HTMLDivElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf(
      <TransferList items={[]} label="Scope" ref={createRef<HTMLFieldSetElement>()} />,
    ).toMatchTypeOf<React.JSX.Element>();
    expectTypeOf<AutocompleteProps["showMatchContext"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<CommandPaletteProps["showExecutionPreview"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<CommandPaletteProps["shouldFilter"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<CommandPaletteProps["presentation"]>().toEqualTypeOf<
      "embedded" | "modal" | undefined
    >();
    expectTypeOf<CreatableSelectProps["showCanonicalPreview"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<MentionFieldProps["showMentionSummary"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<MentionFieldProps["triggers"]>().toMatchTypeOf<
      readonly { readonly entityType: string; readonly symbol: string }[] | undefined
    >();
    expectTypeOf<MultiSelectProps["showSelectionSummary"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<MultiSelectProps["maximumVisibleTokens"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<TagsInputProps["recoverDuplicates"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<TagsInputProps["reorderable"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<TransferListProps["showTransferSummary"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<TransferListProps["filterable"]>().toEqualTypeOf<boolean | undefined>();
  });
});
