import "mergora-tokens/tokens.css";
import "mergora-ui/button.css";
import "mergora-ui/combobox.css";
import "mergora-ui/data-grid.css";
import "mergora-ui/date-picker.css";
import "mergora-ui/dialog.css";
import "mergora-ui/file-upload.css";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Mergora package-mode proof",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
