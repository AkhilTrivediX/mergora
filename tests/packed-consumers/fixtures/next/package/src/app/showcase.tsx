"use client";

import { schemaFor } from "mergora-schema";
import { tokenVariable } from "mergora-tokens";
import { Button } from "mergora-ui/button";
import { Combobox } from "mergora-ui/combobox";
import { Dialog } from "mergora-ui/dialog";

const schemaDialect = schemaFor("config").$schema ?? "missing";

export function Showcase() {
  return (
    <section
      aria-label="Package subpath components"
      className="consumer-stack"
      data-schema-dialect={schemaDialect}
      style={{ background: tokenVariable("semantic.color.background.canvas") }}
    >
      <Button variant="primary">Packed Button</Button>
      <Dialog.Root>
        <Dialog.Trigger>Open packed Dialog</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Packed Dialog</Dialog.Title>
            <Dialog.Description>Built from the exact UI tarball.</Dialog.Description>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <Combobox.Root defaultValue="alpha">
        <Combobox.Label>Packed Combobox</Combobox.Label>
        <Combobox.Input />
        <Combobox.Trigger />
        <Combobox.Popover>
          <Combobox.ListBox>
            <Combobox.Item id="alpha">Alpha</Combobox.Item>
            <Combobox.Item id="beta">Beta</Combobox.Item>
          </Combobox.ListBox>
        </Combobox.Popover>
      </Combobox.Root>
    </section>
  );
}
