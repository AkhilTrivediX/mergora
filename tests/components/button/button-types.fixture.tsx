import { createRef, type MouseEvent } from "react";

import { Button, type ButtonProps } from "../../../registry/source/components/button/button.tsx";

const ref = createRef<HTMLButtonElement>();
const onClick: NonNullable<ButtonProps["onClick"]> = (event: MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.focus();
};

export const validButton = (
  <Button
    aria-describedby="save-description"
    className="consumer-class"
    formAction="/save"
    onClick={onClick}
    ref={ref}
    size="large"
    variant="quiet"
  >
    Save
  </Button>
);

// @ts-expect-error Button variants are deliberately closed.
export const invalidVariant = <Button variant="tertiary">Invalid</Button>;

// @ts-expect-error Button sizes are deliberately closed.
export const invalidSize = <Button size="extra-large">Invalid</Button>;
