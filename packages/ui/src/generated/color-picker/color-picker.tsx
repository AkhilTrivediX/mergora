// Generated from registry/source/components/color-picker/color-picker.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  ColorArea as AriaColorArea,
  ColorThumb as AriaColorAreaThumb,
} from "react-aria-components/ColorArea";
import {
  ColorPicker as AriaColorPicker,
  parseColor as parseAriaColor,
  type Color as AriaColor,
} from "react-aria-components/ColorPicker";
import {
  ColorSlider as AriaColorSlider,
  ColorThumb as AriaColorSliderThumb,
  SliderOutput as AriaSliderOutput,
  SliderTrack as AriaSliderTrack,
  type ColorChannel,
} from "react-aria-components/ColorSlider";
import {
  ColorSwatch as AriaColorSwatch,
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
} from "react-aria-components/ColorSwatchPicker";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type HTMLAttributes,
  type Ref,
} from "react";

import {
  ColorField,
  createSrgbColor,
  serializeColorValue,
  type ColorAlphaPolicy,
  type ColorFieldMessages,
  type ColorTextFormat,
  type SrgbColorValue,
} from "../color-field/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./color-picker.css";

export interface ColorPickerMessages {
  /** Accessible name for the optional opacity channel slider. */
  readonly alphaLabel: string;
  /** Accessible name for the two-dimensional saturation and brightness area. */
  readonly areaLabel: string;
  /** Localized visible and accessible brightness-channel label. */
  readonly brightnessLabel: string;
  /** Visible heading naming the keyboard-operable channel controls. */
  readonly channelHeading: string;
  /** Localized visible and accessible hue-channel label. */
  readonly hueLabel: string;
  /** Accessible name for the complete picker control region. */
  readonly pickerLabel: string;
  /** Localized visible and accessible saturation-channel label. */
  readonly saturationLabel: string;
  /** Fallback accessible name stem for preset swatch options. */
  readonly swatchLabel: string;
  /** Accessible name for the preset swatch collection. */
  readonly swatchesLabel: string;
}

export interface ColorPickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Additional IDs merged into the composed exact editor description. */
  readonly "aria-describedby"?: string;
  /** Additional IDs merged into the composed exact editor error relationship. */
  readonly "aria-errormessage"?: string;
  /** Explicit invalid state forwarded to the composed exact editor. */
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
  /** Accessible picker and editor name when no visible Field label exists. */
  readonly "aria-label"?: string;
  /** IDs of visible content that name the picker and exact editor. */
  readonly "aria-labelledby"?: string;
  /** Allows transparency or requires full opacity; defaults to `allow`. */
  readonly alphaPolicy?: ColorAlphaPolicy;
  /** Opaque sRGB surface used only for optional reference contrast analysis. */
  readonly contrastBackground?: SrgbColorValue;
  /** Finite reference ratio above one forwarded to contrast analysis. */
  readonly contrastThreshold?: number;
  /** Initial valid color for uncontrolled use. */
  readonly defaultValue?: SrgbColorValue;
  /** Disables area, channels, swatches, and exact text editing. */
  readonly disabled?: boolean;
  /** Localized overrides for the composed ColorField messages. */
  readonly fieldMessages?: Partial<ColorFieldMessages>;
  /** Associates the composed hidden canonical control with an external form. */
  readonly form?: string;
  /** Exact text representation used by the composed ColorField. */
  readonly format?: ColorTextFormat;
  /** Returns a non-empty accessible label for each preset swatch. */
  readonly getSwatchLabel?: (color: SrgbColorValue, index: number) => string;
  /** Explicit exact-editor identity, superseded by enclosing Field context. */
  readonly id?: string;
  /** Ref forwarded to the composed exact text input. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Localized overrides for picker, area, channel, and swatch labels. */
  readonly messages?: Partial<ColorPickerMessages>;
  /** Native name for the composed hidden canonical color control. */
  readonly name?: string;
  /** Receives each committed color from area, channels, swatches, or text. */
  readonly onChange?: (value: SrgbColorValue) => void;
  /** Localized hint displayed while the composed exact editor is empty. */
  readonly placeholder?: string;
  /** Preserves value and serialization while disabling all picker editing. */
  readonly readOnly?: boolean;
  /** Applies native required validation to the composed exact editor. */
  readonly required?: boolean;
  /** Shows reference contrast context; false removes its UI, status, and description relationship. */
  readonly showContrast?: boolean;
  /** Shows selected-color preview; false removes its swatch and accessible preview text. */
  readonly showPreview?: boolean;
  /** Preset color options; an empty array removes the swatch collection and option semantics. */
  readonly swatches?: readonly SrgbColorValue[];
  /** Controlled color; changes are proposed through `onChange`. */
  readonly value?: SrgbColorValue;
}

const DEFAULT_COLOR = createSrgbColor({ alpha: 255, blue: 87, green: 122, red: 47 });
const DEFAULT_SWATCHES = Object.freeze([
  createSrgbColor({ alpha: 255, blue: 84, green: 66, red: 183 }),
  createSrgbColor({ alpha: 255, blue: 150, green: 91, red: 49 }),
  createSrgbColor({ alpha: 255, blue: 62, green: 137, red: 44 }),
  createSrgbColor({ alpha: 255, blue: 182, green: 113, red: 79 }),
  createSrgbColor({ alpha: 255, blue: 35, green: 42, red: 201 }),
  createSrgbColor({ alpha: 255, blue: 101, green: 72, red: 139 }),
]);
const DEFAULT_MESSAGES: ColorPickerMessages = {
  alphaLabel: "Opacity",
  areaLabel: "Saturation and brightness",
  brightnessLabel: "Brightness",
  channelHeading: "Keyboard channel controls",
  hueLabel: "Hue",
  pickerLabel: "Color picker controls",
  saturationLabel: "Saturation",
  swatchLabel: "Color swatch",
  swatchesLabel: "Preset colors",
};

function toAriaColor(value: SrgbColorValue): AriaColor {
  return parseAriaColor(serializeColorValue(value, "allow"));
}

function fromAriaColor(value: AriaColor): SrgbColorValue {
  const rgba = value.toFormat("rgba");
  return createSrgbColor({
    alpha: Math.round(rgba.getChannelValue("alpha") * 255),
    blue: Math.round(rgba.getChannelValue("blue")),
    green: Math.round(rgba.getChannelValue("green")),
    red: Math.round(rgba.getChannelValue("red")),
  });
}

function assertPickerValue(
  value: SrgbColorValue,
  alphaPolicy: ColorAlphaPolicy,
  label: string,
): void {
  serializeColorValue(value, alphaPolicy);
  if (label.trim().length === 0) {
    throw new RangeError("Mergora ColorPicker value labels must not be empty.");
  }
}

function setForwardedRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) {
    (ref as { current: T | null }).current = value;
  }
}

interface ChannelControlProps {
  /** React Aria color channel controlled by this keyboard-operable slider. */
  readonly channel: ColorChannel;
  /** Whether the channel slider blocks focus and value changes. */
  readonly disabled: boolean;
  /** Localized visible and accessible channel name. */
  readonly label: string;
}

function ChannelControl({ channel, disabled, label }: ChannelControlProps) {
  return (
    <AriaColorSlider
      aria-label={label}
      channel={channel}
      className="mrg-color-picker-channel"
      colorSpace="hsb"
      data-channel={channel}
      data-slot="color-picker-channel"
      isDisabled={disabled}
    >
      <div className="mrg-color-picker-channel-header" data-slot="color-picker-channel-header">
        <span data-slot="color-picker-channel-label">{label}</span>
        <AriaSliderOutput
          className="mrg-color-picker-channel-output"
          data-slot="color-picker-channel-output"
        />
      </div>
      <AriaSliderTrack
        className="mrg-color-picker-slider-track"
        data-slot="color-picker-slider-track"
      >
        <AriaColorSliderThumb
          className="mrg-color-picker-thumb"
          data-slot="color-picker-slider-thumb"
        />
      </AriaSliderTrack>
    </AriaColorSlider>
  );
}

export const ColorPicker = forwardRef<HTMLDivElement, ColorPickerProps>(
  function ColorPicker(props, ref) {
    const {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      alphaPolicy = "allow",
      className,
      contrastBackground,
      contrastThreshold,
      defaultValue = DEFAULT_COLOR,
      disabled = false,
      fieldMessages,
      form,
      format = "hex",
      getSwatchLabel,
      id,
      inputRef,
      messages: messageOverrides,
      name,
      onChange,
      placeholder,
      readOnly = false,
      required,
      showContrast = true,
      showPreview = true,
      style,
      swatches = DEFAULT_SWATCHES,
      value,
      ...nativeProps
    } = props;
    assertPickerValue(defaultValue, alphaPolicy, "defaultValue");
    if (value !== undefined) assertPickerValue(value, alphaPolicy, "value");
    for (const [index, swatch] of swatches.entries()) {
      assertPickerValue(swatch, alphaPolicy, `swatches[${String(index)}]`);
    }
    if (
      new Set(swatches.map((swatch) => serializeColorValue(swatch, alphaPolicy))).size !==
      swatches.length
    ) {
      throw new RangeError("Mergora ColorPicker swatches must have distinct canonical values.");
    }

    const { locale } = useMergoraContext();
    const channelHeadingId = `mrg-color-picker-channels-${useId().replaceAll(":", "")}`;
    const controlled = value !== undefined;
    const initialValue = useRef(defaultValue);
    const inputElement = useRef<HTMLInputElement | null>(null);
    const auxiliaryResetInProgress = useRef(false);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const selectedValue = controlled ? value : uncontrolledValue;
    const messages = useMemo(
      () => ({ ...DEFAULT_MESSAGES, ...messageOverrides }),
      [messageOverrides],
    );
    const ariaValue = useMemo(() => toAriaColor(selectedValue), [selectedValue]);
    const pickerDisabled = disabled || readOnly;
    const rootClassName =
      className === undefined ? "mrg-color-picker" : `mrg-color-picker ${className}`;

    const publish = (next: SrgbColorValue): void => {
      if (alphaPolicy === "opaque" && next.alpha !== 255) {
        throw new RangeError("Mergora ColorPicker cannot publish alpha with opaque policy.");
      }
      if (!controlled) setUncontrolledValue(next);
      onChange?.(next);
    };
    const publishAria = (next: AriaColor): void => {
      if (!auxiliaryResetInProgress.current) publish(fromAriaColor(next));
    };
    const setInputElement = useCallback(
      (node: HTMLInputElement | null) => {
        inputElement.current = node;
        setForwardedRef(inputRef, node);
      },
      [inputRef],
    );

    useEffect(() => {
      const ownedForm = inputElement.current?.form ?? null;
      if (ownedForm === null) return;
      const handleReset = (event: Event) => {
        const acceptedBeforeReset = selectedValue;
        auxiliaryResetInProgress.current = true;
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          if (event.defaultPrevented && !controlled) {
            setUncontrolledValue(acceptedBeforeReset);
          }
          resetTimer.current = setTimeout(() => {
            auxiliaryResetInProgress.current = false;
          }, 0);
        }, 0);
      };
      ownedForm.addEventListener("reset", handleReset, { capture: true });
      return () => {
        ownedForm.removeEventListener("reset", handleReset, { capture: true });
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        auxiliaryResetInProgress.current = false;
      };
    }, [controlled, form, selectedValue]);

    return (
      <div
        {...nativeProps}
        aria-label={messages.pickerLabel}
        className={rootClassName}
        data-alpha-policy={alphaPolicy}
        data-disabled={disabled || undefined}
        data-readonly={readOnly || undefined}
        data-slot="color-picker"
        ref={ref}
        role="group"
        style={style}
      >
        <span className="mrg-color-picker-label" data-slot="color-picker-label">
          {messages.pickerLabel}
        </span>
        <AriaI18nProvider locale={locale}>
          <AriaColorPicker onChange={publishAria} value={ariaValue}>
            <AriaColorArea
              aria-label={messages.areaLabel}
              className="mrg-color-picker-area"
              colorSpace="hsb"
              data-slot="color-picker-area"
              isDisabled={pickerDisabled}
              xChannel="saturation"
              yChannel="brightness"
            >
              <AriaColorAreaThumb
                className="mrg-color-picker-thumb"
                data-slot="color-picker-area-thumb"
              />
            </AriaColorArea>

            <section aria-labelledby={channelHeadingId} data-slot="color-picker-channels">
              <span
                className="mrg-color-picker-section-label"
                data-slot="color-picker-channel-heading"
                id={channelHeadingId}
              >
                {messages.channelHeading}
              </span>
              <div className="mrg-color-picker-channel-grid">
                <ChannelControl channel="hue" disabled={pickerDisabled} label={messages.hueLabel} />
                <ChannelControl
                  channel="saturation"
                  disabled={pickerDisabled}
                  label={messages.saturationLabel}
                />
                <ChannelControl
                  channel="brightness"
                  disabled={pickerDisabled}
                  label={messages.brightnessLabel}
                />
                {alphaPolicy === "opaque" ? null : (
                  <ChannelControl
                    channel="alpha"
                    disabled={pickerDisabled}
                    label={messages.alphaLabel}
                  />
                )}
              </div>
            </section>

            {swatches.length === 0 ? null : (
              <section
                aria-label={messages.swatchesLabel}
                data-slot="color-picker-swatches-section"
              >
                <span
                  className="mrg-color-picker-section-label"
                  data-slot="color-picker-swatches-label"
                >
                  {messages.swatchesLabel}
                </span>
                <AriaColorSwatchPicker
                  aria-label={messages.swatchesLabel}
                  className="mrg-color-picker-swatches"
                  data-slot="color-picker-swatches"
                  layout="grid"
                  onChange={publishAria}
                  value={ariaValue}
                >
                  {swatches.map((swatch, index) => {
                    const canonical = serializeColorValue(swatch, alphaPolicy);
                    const swatchLabel =
                      getSwatchLabel?.(swatch, index) ??
                      `${messages.swatchLabel} ${String(index + 1)}: ${canonical}`;
                    if (swatchLabel.trim().length === 0) {
                      throw new RangeError("Mergora ColorPicker swatch labels must not be empty.");
                    }
                    return (
                      <AriaColorSwatchPickerItem
                        aria-label={swatchLabel}
                        className="mrg-color-picker-swatch-item"
                        color={toAriaColor(swatch)}
                        data-slot="color-picker-swatch-item"
                        isDisabled={pickerDisabled}
                        key={canonical}
                      >
                        <AriaColorSwatch
                          className="mrg-color-picker-swatch"
                          data-slot="color-picker-swatch"
                        />
                        <bdi className="mrg-color-picker-swatch-value">{canonical}</bdi>
                      </AriaColorSwatchPickerItem>
                    );
                  })}
                </AriaColorSwatchPicker>
              </section>
            )}
          </AriaColorPicker>
        </AriaI18nProvider>

        <ColorField
          {...(ariaDescribedBy === undefined ? {} : { "aria-describedby": ariaDescribedBy })}
          {...(ariaErrorMessage === undefined ? {} : { "aria-errormessage": ariaErrorMessage })}
          {...(ariaInvalid === undefined ? {} : { "aria-invalid": ariaInvalid })}
          {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
          {...(ariaLabelledBy === undefined ? {} : { "aria-labelledby": ariaLabelledBy })}
          {...(contrastBackground === undefined ? {} : { contrastBackground })}
          {...(contrastThreshold === undefined ? {} : { contrastThreshold })}
          {...(fieldMessages === undefined ? {} : { messages: fieldMessages })}
          {...(form === undefined ? {} : { form })}
          {...(id === undefined ? {} : { id })}
          {...(name === undefined ? {} : { name })}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(required === undefined ? {} : { required })}
          alphaPolicy={alphaPolicy}
          defaultValue={initialValue.current}
          disabled={disabled}
          format={format}
          inputRef={setInputElement}
          onChange={(next) => {
            if (next !== null) publish(next);
          }}
          readOnly={readOnly}
          showContrast={showContrast}
          showPreview={showPreview}
          value={selectedValue}
        />
      </div>
    );
  },
);

ColorPicker.displayName = "ColorPicker";
