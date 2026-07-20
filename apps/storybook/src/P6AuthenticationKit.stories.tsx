import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";

import "mergora-tokens/tokens.css";
import {
  AuthenticationKit,
  type AuthenticationFlow,
  type AuthenticationResult,
} from "../../../registry/source/kits/authentication-kit/index.ts";

interface AuthenticationStoryProps {
  readonly flowNavigation: boolean;
  readonly rateLimitRecovery: boolean;
  readonly securityContext: boolean;
}

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const flows: readonly AuthenticationFlow[] = [
  "sign-in",
  "sign-up",
  "password-reset",
  "passkey",
  "mfa",
  "recovery-code",
];

function AuthenticationStory({
  flowNavigation,
  rateLimitRecovery,
  securityContext,
}: AuthenticationStoryProps) {
  const [readyCount, setReadyCount] = useState(0);
  return (
    <main style={canvasStyle}>
      <AuthenticationKit
        availableFlows={flows}
        onRateLimitReady={() => setReadyCount((count) => count + 1)}
        onSubmit={({ flow }): AuthenticationResult =>
          flow === "sign-in"
            ? {
                message: "Too many attempts. Wait before trying this account again.",
                retryAfterSeconds: 2,
                status: "rate-limited",
              }
            : { message: `${flow} request accepted by the local fixture.`, status: "success" }
        }
        showFlowNavigation={flowNavigation}
        showRateLimitRecovery={rateLimitRecovery}
        showSecurityContext={securityContext}
      />
      {rateLimitRecovery ? <output>Recovery-ready callbacks: {readyCount}</output> : null}
    </main>
  );
}

const meta = {
  title: "Kits/Authentication Kit",
  component: AuthenticationStory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  argTypes: {
    flowNavigation: { control: "boolean" },
    rateLimitRecovery: { control: "boolean" },
    securityContext: { control: "boolean" },
  },
} satisfies Meta<typeof AuthenticationStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicAuthenticationKit: Story = {
  args: { flowNavigation: false, rateLimitRecovery: false, securityContext: false },
};

export const RecommendedAuthenticationKit: Story = {
  args: { flowNavigation: true, rateLimitRecovery: true, securityContext: true },
};

function ControlledAuthenticationExample() {
  const [flow, setFlow] = useState<AuthenticationFlow>("mfa");
  return (
    <main style={canvasStyle}>
      <AuthenticationKit
        availableFlows={flows}
        flow={flow}
        onFlowChange={setFlow}
        onSubmit={() => ({ message: "Controlled flow submitted.", status: "success" })}
        showFlowNavigation
        showSecurityContext
      />
      <output>Controlled flow: {flow}</output>
    </main>
  );
}

export const ControlledAuthenticationKit: Story = {
  args: { flowNavigation: true, rateLimitRecovery: false, securityContext: true },
  render: () => <ControlledAuthenticationExample />,
};

export const AuthenticationStateMatrix: Story = {
  args: { flowNavigation: false, rateLimitRecovery: false, securityContext: false },
  render: () => (
    <main style={{ ...canvasStyle, display: "grid", gap: "2rem" }}>
      <section aria-labelledby="authentication-disabled-heading">
        <h2 id="authentication-disabled-heading">Disabled</h2>
        <AuthenticationKit disabled onSubmit={() => ({ message: "Unused", status: "success" })} />
      </section>
      <section aria-labelledby="authentication-readonly-heading">
        <h2 id="authentication-readonly-heading">Read only</h2>
        <AuthenticationKit readOnly />
      </section>
      <section aria-labelledby="authentication-loading-heading">
        <h2 id="authentication-loading-heading">Loading</h2>
        <AuthenticationKit loading onSubmit={() => ({ message: "Unused", status: "success" })} />
      </section>
      <section aria-labelledby="authentication-error-heading">
        <h2 id="authentication-error-heading">Recoverable error</h2>
        <AuthenticationKit
          onSubmit={() => {
            throw new Error("The local authentication fixture is unavailable.");
          }}
        />
      </section>
    </main>
  ),
};

export const AuthenticationFormLifecycle: Story = {
  args: { flowNavigation: false, rateLimitRecovery: false, securityContext: false },
  render: () => (
    <main style={canvasStyle}>
      <AuthenticationKit
        onSubmit={({ fields }) => ({
          message: `Serialized fields: ${Object.keys(fields).sort().join(", ")}`,
          status: "success",
        })}
      />
    </main>
  ),
};

export const NarrowRtlAuthentication: Story = {
  args: { flowNavigation: true, rateLimitRecovery: true, securityContext: true },
  globals: { viewport: { value: "mobile1" } },
  render: (args) => (
    <div dir="rtl">
      <AuthenticationStory {...args} />
    </div>
  ),
};
