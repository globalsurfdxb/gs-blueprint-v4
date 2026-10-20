"use client";

import { useState } from "react";

export function OneDriveLinksField() {
  const [rowCount, setRowCount] = useState(1);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">OneDrive Links <span className="text-gs-gray">(optional)</span></span>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rowCount }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <input
              name="linkUrls"
              aria-label={`Link URL ${i + 1}`}
              type="url"
              placeholder="https://..."
              className="field min-w-0 flex-1"
            />
            <input
              name="linkLabels"
              aria-label={`Link label ${i + 1}`}
              placeholder="Label (optional)"
              className="field w-full sm:w-40"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRowCount((n) => n + 1)}
        className="self-start py-2 text-xs text-gs-red hover:underline"
      >
        + Add another link
      </button>
      <p className="text-xs text-gs-gray">Shared project documentation — brief, brand assets, reporting sheet, etc.</p>
    </div>
  );
}
