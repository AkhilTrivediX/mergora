"use client";

import "./billing-subscription-kit.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";

export type BillingInvoiceStatus = "draft" | "due" | "paid" | "refunded" | "failed";

export interface BillingPlan {
  /** Optional supporting plan copy rendered beneath the name and price. */
  readonly description?: ReactNode;
  /** Prevents this plan's native radio choice while leaving its details readable. */
  readonly disabled?: boolean;
  /** Optional ordered feature summary rendered as plain list content. */
  readonly features?: readonly string[];
  /** Stable non-empty plan identifier used as the native radio and request value. */
  readonly id: string;
  /** Visible plan name used in choices and the current-selection summary. */
  readonly name: ReactNode;
  /** Consumer-formatted price and cadence label; no currency assumptions are applied. */
  readonly priceLabel: ReactNode;
}

export interface BillingInvoice {
  /** Consumer-formatted amount text shown in the invoice table. */
  readonly amountLabel: ReactNode;
  /** Consumer-formatted date text shown in the invoice table. */
  readonly dateLabel: ReactNode;
  /** Stable board-wide invoice identifier used for row identity and opening context. */
  readonly id: string;
  /** Invoice lifecycle rendered as visible text and stable state metadata. */
  readonly status: BillingInvoiceStatus;
}

export interface BillingCancellationReview {
  /** Ordered effects the user must review before cancellation can be confirmed. */
  readonly consequences: readonly string[];
  /** Consumer-owned cancellation context shown before the confirmation flow. */
  readonly description: ReactNode;
  /** Performs cancellation after acknowledgement with a lifecycle abort signal. */
  readonly onConfirm: (signal: AbortSignal) => void | Promise<void>;
  /** Optional cancellation section heading with a safe default when omitted. */
  readonly title?: ReactNode;
}

export interface BillingPlanChangeRequest {
  /** String-valued native FormData entries collected from the complete form. */
  readonly fields: Readonly<Record<string, string>>;
  /** Selected plan identifier at the instant the validated form is submitted. */
  readonly planId: string;
}

export interface BillingSubscriptionKitProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "children" | "defaultValue" | "onChange" | "onSubmit" | "value"
> {
  /** Adds consequence review and guarded confirmation; false removes its UI, state, and request events. */
  readonly cancellationReview?: false | BillingCancellationReview;
  /** Initial selected plan for uncontrolled use and native form reset. */
  readonly defaultSelectedPlanId?: string;
  /** Disables plan, invoice, payment, and cancellation interactions while preserving context. */
  readonly disabled?: boolean;
  /** Consumer error content rendered as an alert after the kit sections. */
  readonly error?: ReactNode;
  /** Immutable invoice records rendered in a keyboard-scrollable semantic table. */
  readonly invoices: readonly BillingInvoice[];
  /** Externally controlled busy state reflected by form semantics and submit progress. */
  readonly loading?: boolean;
  /** Native radio field name used to serialize the selected plan ID. */
  readonly name?: string;
  /** Adds per-row invoice actions and receives the exact activated invoice record. */
  readonly onInvoiceOpen?: (invoice: BillingInvoice) => void;
  /** Handles a native form plan request with an abort signal; omission disables submission. */
  readonly onPlanSubmit?: (
    request: BillingPlanChangeRequest,
    signal: AbortSignal,
  ) => void | Promise<void>;
  /** Reports controlled or uncontrolled selection changes and native form reset. */
  readonly onSelectedPlanChange?: (planId: string) => void;
  /** Adds consumer-owned payment controls; false removes the section and all nested semantics. */
  readonly paymentMethodForm?: false | ReactNode;
  /** Non-empty immutable plan choices with unique stable identifiers. */
  readonly plans: readonly BillingPlan[];
  /** Prevents selection, submission, cancellation, and reset mutation while retaining form review. */
  readonly readOnly?: boolean;
  /** Adds a selected-plan preview output; false removes its UI and render invocation. */
  readonly renderChangePreview?: false | ((plan: BillingPlan) => ReactNode);
  /** Controlled selected plan ID; use with `onSelectedPlanChange`. */
  readonly selectedPlanId?: string;
}

function assertBillingData(
  plans: readonly BillingPlan[],
  invoices: readonly BillingInvoice[],
  selectedPlanId: string,
): void {
  const planIds = plans.map((plan) => plan.id);
  const invoiceIds = invoices.map((invoice) => invoice.id);
  if (plans.length === 0 || planIds.some((id) => id.trim().length === 0)) {
    throw new RangeError("Mergora BillingSubscriptionKit requires named plans.");
  }
  if (new Set(planIds).size !== planIds.length || new Set(invoiceIds).size !== invoiceIds.length) {
    throw new RangeError("Mergora BillingSubscriptionKit plan and invoice IDs must be unique.");
  }
  if (!planIds.includes(selectedPlanId)) {
    throw new RangeError("Mergora BillingSubscriptionKit selected plan must be available.");
  }
}

function stringFields(form: HTMLFormElement): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

export const BillingSubscriptionKit = forwardRef<HTMLFormElement, BillingSubscriptionKitProps>(
  function BillingSubscriptionKit(
    {
      cancellationReview = false,
      className,
      plans,
      defaultSelectedPlanId = plans[0]?.id ?? "",
      disabled = false,
      error,
      invoices,
      loading = false,
      name = "planId",
      onInvoiceOpen,
      onPlanSubmit,
      onReset,
      onSelectedPlanChange,
      paymentMethodForm = false,
      readOnly = false,
      renderChangePreview = false,
      selectedPlanId,
      ...props
    },
    ref,
  ) {
    const controlled = selectedPlanId !== undefined;
    const [uncontrolledPlanId, setUncontrolledPlanId] = useState(defaultSelectedPlanId);
    const resolvedPlanId = selectedPlanId ?? uncontrolledPlanId;
    assertBillingData(plans, invoices, resolvedPlanId);
    const selectedPlan = plans.find((plan) => plan.id === resolvedPlanId)!;
    const generatedId = useId().replaceAll(":", "");
    const plansHeadingId = `mrg-billing-${generatedId}-plans`;
    const invoicesHeadingId = `mrg-billing-${generatedId}-invoices`;
    const paymentHeadingId = `mrg-billing-${generatedId}-payment`;
    const cancellationHeadingId = `mrg-billing-${generatedId}-cancellation`;
    const instanceLabel =
      typeof props["aria-label"] === "string" && props["aria-label"].trim().length > 0
        ? props["aria-label"].trim()
        : null;
    const planRequestController = useRef<AbortController | null>(null);
    const cancellationRequestController = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false);
    const [reviewingCancellation, setReviewingCancellation] = useState(false);
    const [understood, setUnderstood] = useState(false);
    const [cancellationPending, setCancellationPending] = useState(false);
    const [cancellationError, setCancellationError] = useState<string | null>(null);

    useEffect(
      () => () => {
        planRequestController.current?.abort();
        cancellationRequestController.current?.abort();
      },
      [],
    );

    useEffect(() => {
      if (cancellationReview !== false) return;
      cancellationRequestController.current?.abort();
      cancellationRequestController.current = null;
      setReviewingCancellation(false);
      setUnderstood(false);
      setCancellationPending(false);
      setCancellationError(null);
    }, [cancellationReview]);

    const choosePlan = (planId: string): void => {
      if (disabled || readOnly || pending || planId === resolvedPlanId) return;
      if (!controlled) setUncontrolledPlanId(planId);
      onSelectedPlanChange?.(planId);
    };

    const submitPlan = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (disabled || readOnly || pending || onPlanSubmit === undefined) return;
      planRequestController.current?.abort();
      const controller = new AbortController();
      planRequestController.current = controller;
      setPending(true);
      try {
        await onPlanSubmit(
          { fields: stringFields(event.currentTarget), planId: resolvedPlanId },
          controller.signal,
        );
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    };

    const confirmCancellation = async (): Promise<void> => {
      if (
        cancellationReview === false ||
        !understood ||
        disabled ||
        readOnly ||
        cancellationPending
      ) {
        return;
      }
      cancellationRequestController.current?.abort();
      const controller = new AbortController();
      cancellationRequestController.current = controller;
      setCancellationPending(true);
      setCancellationError(null);
      try {
        await cancellationReview.onConfirm(controller.signal);
        if (!controller.signal.aborted) setReviewingCancellation(false);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setCancellationError(
            nextError instanceof Error ? nextError.message : "Cancellation could not continue.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setCancellationPending(false);
      }
    };

    return (
      <form
        {...props}
        aria-busy={loading || pending || cancellationPending || undefined}
        className={
          className === undefined
            ? "mrg-billing-subscription-kit"
            : `mrg-billing-subscription-kit ${className}`
        }
        data-slot="billing-subscription-kit"
        onReset={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          onReset?.(event);
          if (event.defaultPrevented) return;
          cancellationRequestController.current?.abort();
          cancellationRequestController.current = null;
          if (!controlled) setUncontrolledPlanId(defaultSelectedPlanId);
          onSelectedPlanChange?.(defaultSelectedPlanId);
          setReviewingCancellation(false);
          setUnderstood(false);
          setCancellationPending(false);
          setCancellationError(null);
        }}
        onSubmit={(event) => void submitPlan(event)}
        ref={ref}
      >
        <header data-slot="billing-header">
          <h1>Subscription and billing</h1>
          <p>Review plan choices and billing records before requesting a consumer-owned change.</p>
        </header>

        <section
          aria-label={instanceLabel === null ? undefined : `${instanceLabel}: plans`}
          aria-labelledby={instanceLabel === null ? plansHeadingId : undefined}
          data-slot="billing-plans"
        >
          <div data-slot="billing-section-heading">
            <h2 id={plansHeadingId}>Plans</h2>
            <p>Current choice: {selectedPlan.name}</p>
          </div>
          <fieldset disabled={disabled || pending}>
            <legend>Choose a plan</legend>
            {plans.map((plan) => (
              <label data-selected={plan.id === resolvedPlanId || undefined} key={plan.id}>
                <input
                  checked={plan.id === resolvedPlanId}
                  disabled={plan.disabled}
                  name={name}
                  onChange={() => choosePlan(plan.id)}
                  readOnly={readOnly}
                  type="radio"
                  value={plan.id}
                />
                <span data-slot="billing-plan-copy">
                  <strong>{plan.name}</strong>
                  <span>{plan.priceLabel}</span>
                  {plan.description === undefined ? null : <small>{plan.description}</small>}
                  {plan.features === undefined ? null : (
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          {renderChangePreview === false ? null : (
            <output data-slot="billing-change-preview">{renderChangePreview(selectedPlan)}</output>
          )}
          <div data-slot="billing-actions">
            <Button
              disabled={disabled || readOnly || onPlanSubmit === undefined}
              pending={loading || pending}
              pendingLabel="Applying plan choice"
              type="submit"
            >
              Apply plan choice
            </Button>
            <Button disabled={disabled || readOnly || pending} type="reset" variant="quiet">
              Reset choice
            </Button>
          </div>
        </section>

        <section
          aria-label={instanceLabel === null ? undefined : `${instanceLabel}: invoices`}
          aria-labelledby={instanceLabel === null ? invoicesHeadingId : undefined}
          data-slot="billing-invoices"
        >
          <div data-slot="billing-section-heading">
            <h2 id={invoicesHeadingId}>Invoices</h2>
            <p>
              {invoices.length === 0
                ? "No invoices are available."
                : `${String(invoices.length)} records`}
            </p>
          </div>
          {invoices.length === 0 ? (
            <p data-slot="billing-empty">Billing records will appear here when supplied.</p>
          ) : (
            <div
              data-slot="billing-table-scroll"
              role="region"
              aria-label={
                instanceLabel === null ? "Invoice records" : `${instanceLabel}: invoice records`
              }
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Date</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    {onInvoiceOpen === undefined ? null : <th scope="col">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <th scope="row">{invoice.id}</th>
                      <td>{invoice.dateLabel}</td>
                      <td>{invoice.amountLabel}</td>
                      <td data-status={invoice.status}>{invoice.status}</td>
                      {onInvoiceOpen === undefined ? null : (
                        <td>
                          <Button
                            disabled={disabled}
                            onClick={() => onInvoiceOpen(invoice)}
                            size="small"
                            type="button"
                            variant="quiet"
                          >
                            Open {invoice.id}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {paymentMethodForm === false ? null : (
          <section
            aria-label={instanceLabel === null ? undefined : `${instanceLabel}: payment method`}
            aria-labelledby={instanceLabel === null ? paymentHeadingId : undefined}
            data-slot="billing-payment-method"
          >
            <div data-slot="billing-section-heading">
              <h2 id={paymentHeadingId}>Payment method</h2>
              <p>Consumer-supplied form shell; no payment SDK or secret is bundled.</p>
            </div>
            {paymentMethodForm}
          </section>
        )}

        {cancellationReview === false ? null : (
          <section
            aria-label={
              instanceLabel === null ? undefined : `${instanceLabel}: cancellation review`
            }
            aria-labelledby={instanceLabel === null ? cancellationHeadingId : undefined}
            data-slot="billing-cancellation"
          >
            <div data-slot="billing-section-heading">
              <h2 id={cancellationHeadingId}>
                {cancellationReview.title ?? "Cancellation review"}
              </h2>
              <p>{cancellationReview.description}</p>
            </div>
            {!reviewingCancellation ? (
              <Button
                disabled={disabled || readOnly}
                onClick={() => setReviewingCancellation(true)}
                type="button"
                variant="secondary"
              >
                Review cancellation
              </Button>
            ) : (
              <div data-slot="billing-cancellation-review">
                <h3>Review the effects before continuing</h3>
                <ul>
                  {cancellationReview.consequences.map((consequence) => (
                    <li key={consequence}>{consequence}</li>
                  ))}
                </ul>
                <label>
                  <input
                    checked={understood}
                    disabled={disabled || cancellationPending}
                    onChange={(event) => setUnderstood(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  I understand these effects
                </label>
                {cancellationError === null ? null : <div role="alert">{cancellationError}</div>}
                <div data-slot="billing-actions">
                  <Button
                    disabled={!understood || disabled || readOnly}
                    onClick={() => void confirmCancellation()}
                    pending={cancellationPending}
                    pendingLabel="Requesting cancellation"
                    type="button"
                    variant="destructive"
                  >
                    Request cancellation
                  </Button>
                  <Button
                    disabled={cancellationPending}
                    onClick={() => {
                      setReviewingCancellation(false);
                      setUnderstood(false);
                      setCancellationError(null);
                    }}
                    type="button"
                    variant="quiet"
                  >
                    Keep subscription
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        {error === undefined ? null : (
          <div data-slot="billing-error" role="alert">
            {error}
          </div>
        )}
      </form>
    );
  },
);

BillingSubscriptionKit.displayName = "BillingSubscriptionKit";

export const BillingSubscriptionPage = BillingSubscriptionKit;
