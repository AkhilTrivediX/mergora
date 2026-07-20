"use client";

import { useEffect, useState } from "react";

import {
  announceInstallBasket,
  INSTALL_BASKET_EVENT,
  persistInstallBasket,
  readInstallBasket,
} from "./install-basket";

export function InstallBasketButton({ itemId }: { readonly itemId: string }) {
  const [basket, setBasket] = useState<readonly string[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const selected = basket.includes(itemId);

  useEffect(() => {
    setBasket(readInstallBasket());
    const update = (event: Event) => {
      const items = (event as CustomEvent<{ readonly items?: unknown }>).detail?.items;
      if (Array.isArray(items) && items.every((item) => typeof item === "string")) {
        setBasket(items);
      }
    };
    window.addEventListener(INSTALL_BASKET_EVENT, update);
    return () => window.removeEventListener(INSTALL_BASKET_EVENT, update);
  }, []);

  return (
    <div className="install-basket-control">
      <button
        aria-pressed={selected}
        onClick={() => {
          const next = selected
            ? basket.filter((candidate) => candidate !== itemId)
            : [...basket, itemId];
          setBasket(next);
          setStorageUnavailable(!persistInstallBasket(next));
          announceInstallBasket(next);
        }}
        type="button"
      >
        {selected ? "Remove from install" : "Add to install"}
      </button>
      {storageUnavailable ? <span role="status">Saved for this page session only.</span> : null}
    </div>
  );
}
