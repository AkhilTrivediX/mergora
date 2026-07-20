import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/index.ts";
import { Input } from "../../../registry/source/components/input/index.ts";
import {
  BillingSubscriptionKit,
  type BillingInvoice,
  type BillingPlan,
} from "../../../registry/source/kits/billing-subscription-kit/index.ts";

interface BillingStoryProps {
  readonly cancellationReview: boolean;
  readonly changePreview: boolean;
  readonly invoiceActions: boolean;
  readonly paymentMethod: boolean;
}

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const plans: readonly BillingPlan[] = [
  {
    description: "For one active workspace.",
    features: ["Core components", "Community updates"],
    id: "starter",
    name: "Starter",
    priceLabel: "€12 per month",
  },
  {
    description: "For teams coordinating shared evidence.",
    features: ["Shared workspaces", "Evidence history"],
    id: "team",
    name: "Team",
    priceLabel: "€36 per month",
  },
  {
    description: "For organizations with governance requirements.",
    features: ["Policy controls", "Priority support"],
    id: "organization",
    name: "Organization",
    priceLabel: "Contact the provider",
  },
];

const invoices = [
  { amountLabel: "€12.00", dateLabel: "15 June 2026", id: "INV-1042", status: "paid" as const },
  { amountLabel: "€12.00", dateLabel: "15 May 2026", id: "INV-1031", status: "paid" as const },
  {
    amountLabel: "€12.00",
    dateLabel: "15 April 2026",
    id: "INV-1017",
    status: "refunded" as const,
  },
] as const;

function BillingStory({
  cancellationReview,
  changePreview,
  invoiceActions,
  paymentMethod,
}: BillingStoryProps) {
  const [event, setEvent] = useState("No request yet.");
  return (
    <main style={canvasStyle}>
      <BillingSubscriptionKit
        cancellationReview={
          cancellationReview
            ? {
                consequences: [
                  "Shared workspaces become read only at the end of the current term.",
                  "Export remains a separate consumer-owned operation.",
                ],
                description: "Review access and retention effects before requesting cancellation.",
                onConfirm: () => setEvent("Cancellation requested in the local fixture."),
              }
            : false
        }
        invoices={invoices}
        onPlanSubmit={({ planId }) => setEvent(`Requested ${planId}.`)}
        paymentMethodForm={
          paymentMethod ? (
            <div style={{ display: "grid", gap: "1rem", maxInlineSize: "32rem" }}>
              <Field label="Name on payment method" required>
                <Input autoComplete="cc-name" name="paymentName" required />
              </Field>
              <Field
                description="A real integration should render provider-hosted secure fields here."
                label="Provider field boundary"
              >
                <Input disabled value="Consumer payment provider" />
              </Field>
            </div>
          ) : (
            false
          )
        }
        plans={plans}
        renderChangePreview={
          changePreview
            ? (plan) => (
                <span>
                  {plan.name} would begin on 1 August 2026. The provider must calculate taxes,
                  credits, and the next invoice.
                </span>
              )
            : false
        }
        {...(invoiceActions
          ? { onInvoiceOpen: (invoice: BillingInvoice) => setEvent(`Opened ${invoice.id}.`) }
          : {})}
      />
      <output>{event}</output>
    </main>
  );
}

const meta = {
  title: "Kits/Billing Subscription Kit",
  component: BillingStory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  argTypes: {
    cancellationReview: { control: "boolean" },
    changePreview: { control: "boolean" },
    invoiceActions: { control: "boolean" },
    paymentMethod: { control: "boolean" },
  },
} satisfies Meta<typeof BillingStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicBillingSubscriptionKit: Story = {
  args: {
    cancellationReview: false,
    changePreview: false,
    invoiceActions: false,
    paymentMethod: false,
  },
};

export const RecommendedBillingSubscriptionKit: Story = {
  args: {
    cancellationReview: true,
    changePreview: true,
    invoiceActions: true,
    paymentMethod: true,
  },
};

function ControlledBillingExample() {
  const [planId, setPlanId] = useState("starter");
  return (
    <main style={canvasStyle}>
      <BillingSubscriptionKit
        invoices={invoices}
        onPlanSubmit={() => undefined}
        onSelectedPlanChange={setPlanId}
        plans={plans}
        renderChangePreview={(plan) => `Controlled selection: ${String(plan.name)}`}
        selectedPlanId={planId}
      />
      <output>Selected plan ID: {planId}</output>
    </main>
  );
}

export const ControlledBillingSubscriptionKit: Story = {
  args: BasicBillingSubscriptionKit.args,
  render: () => <ControlledBillingExample />,
};

const stateCancellationReview = {
  consequences: ["Existing access remains readable until the consumer applies the change."],
  description: "Review the consumer-owned cancellation boundary.",
  onConfirm: () => undefined,
} as const;

function ReadOnlyBillingExample() {
  const [resetEvents, setResetEvents] = useState(0);
  const [selectionEvents, setSelectionEvents] = useState(0);
  return (
    <>
      <BillingSubscriptionKit
        aria-label="Read-only billing"
        cancellationReview={stateCancellationReview}
        invoices={[]}
        onReset={() => setResetEvents((current) => current + 1)}
        onSelectedPlanChange={() => setSelectionEvents((current) => current + 1)}
        paymentMethodForm={<p>Provider fields remain consumer-owned.</p>}
        plans={plans}
        readOnly
      />
      <output data-slot="billing-readonly-events">
        Read-only reset events: {resetEvents}; selection events: {selectionEvents}
      </output>
    </>
  );
}

export const BillingStateMatrix: Story = {
  args: BasicBillingSubscriptionKit.args,
  render: () => (
    <main style={{ ...canvasStyle, display: "grid", gap: "2rem" }}>
      <section aria-labelledby="billing-empty-heading">
        <h2 id="billing-empty-heading">Empty and read only</h2>
        <ReadOnlyBillingExample />
      </section>
      <section aria-labelledby="billing-disabled-heading">
        <h2 id="billing-disabled-heading">Disabled and loading</h2>
        <BillingSubscriptionKit
          aria-label="Disabled billing"
          cancellationReview={stateCancellationReview}
          disabled
          invoices={invoices}
          loading
          paymentMethodForm={<p>Provider fields remain consumer-owned.</p>}
          plans={plans}
        />
      </section>
      <section aria-labelledby="billing-error-heading">
        <h2 id="billing-error-heading">Error</h2>
        <BillingSubscriptionKit
          aria-label="Billing error state"
          error="Billing records could not be refreshed. Existing records remain readable."
          invoices={invoices}
          plans={plans}
        />
      </section>
    </main>
  ),
};

export const BillingFormLifecycle: Story = {
  args: BasicBillingSubscriptionKit.args,
  render: () => (
    <main style={canvasStyle}>
      <BillingSubscriptionKit
        defaultSelectedPlanId="team"
        invoices={invoices}
        onPlanSubmit={() => undefined}
        plans={plans}
      />
    </main>
  ),
};

export const NarrowRtlBilling: Story = {
  args: RecommendedBillingSubscriptionKit.args,
  globals: { viewport: { value: "mobile1" } },
  render: (args) => (
    <div dir="rtl">
      <BillingStory {...args} />
    </div>
  ),
};
