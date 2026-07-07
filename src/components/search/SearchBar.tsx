"use client";

import { Search, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  return (
    <div className="glass-panel pointer-events-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-full px-3">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Accidents in Nairobi this week…"
        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none"
      />
      {searchQuery && (
        <button onClick={() => setSearchQuery("")} className="text-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
