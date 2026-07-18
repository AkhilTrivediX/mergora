"use client";

import { schemaFor } from "mergora-schema";
import { tokenVariable } from "mergora-tokens";
import { Button } from "../components/button/button";
import { Combobox } from "../components/combobox/combobox";
import { Dialog } from "../components/dialog";

const schemaDialect = schemaFor("config").$schema ?? "missing";

export function Showcase() {
  return (
    <section
      aria-label="CLI-copied source components"
      className="consumer-stack"
      data-schema-dialect={schemaDialect}
      style={{ background: tokenVariable("semantic.color.background.canvas") }}
    >
      <Button variant="primary">Source Button</Button>
      <Dialog.Root>
        <Dialog.Trigger>Open source Dialog</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Source Dialog</Dialog.Title>
            <Dialog.Description>Installed by the exact packed CLI.</Dialog.Description>
            <Dialog.Close>Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <Combobox.Root defaultValue="alpha">
        <Combobox.Label>Source Combobox</Combobox.Label>
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
