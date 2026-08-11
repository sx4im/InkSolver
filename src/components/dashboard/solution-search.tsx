"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Search, Sparkles } from "lucide-react";

import { Latex } from "@/components/math/latex";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/types";

type SearchResult = {
  id: string;
  problemText: string;
  finalAnswer: string;
  canvasId: string;
  canvasTitle: string;
};

export function SolutionSearch({ plan }: { plan: Plan }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed || isSearching) return;

    setIsSearching(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/solutions/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 5 }),
      });

      if (response.status === 403) {
        setResults(null);
        setMessage("Semantic search is a Pro feature.");
        return;
      }

      if (response.status === 503) {
        setResults(null);
        setMessage("Search is not configured on this server yet.");
        return;
      }

      if (!response.ok) {
        throw new Error(`Search failed with ${response.status}`);
      }

      const payload = (await response.json()) as { results?: SearchResult[] };
      setResults(payload.results ?? []);

      if (!payload.results?.length) {
        setMessage("No matching solutions yet. Solve a few problems first.");
      }
    } catch {
      setResults(null);
      setMessage("Search failed. Try again.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted" aria-hidden="true" />
        <h2 className="text-lg font-normal text-ink">Search past solutions</h2>
      </div>

      {plan === "pro" ? (
        <>
          <form className="mt-4 flex gap-2" onSubmit={handleSearch}>
            <label className="sr-only" htmlFor="solution-search">
              Search your solutions
            </label>
            <input
              id="solution-search"
              type="search"
              className="h-11 min-w-0 flex-1 rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-[#458fff]"
              placeholder="e.g. projectile range at 30 degrees"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button size="icon" aria-label="Search" disabled={isSearching || !query.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </form>

          {results?.length ? (
            <ul className="mt-4 space-y-2">
              {results.map((result) => (
                <li key={result.id}>
                  <Link
                    href={`/c/${result.canvasId}`}
                    className="block rounded-md border border-hairline p-3 transition-colors active:bg-surface-soft"
                  >
                    <p className="line-clamp-2 text-sm leading-5 text-body">{result.problemText}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                      <span className="truncate">
                        <Latex value={result.finalAnswer} />
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {result.canvasTitle}
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted">
          <Sparkles className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          Pro accounts can search every past solution by meaning, not just keywords. Upgrade in
          Settings to enable it.
        </p>
      )}

      {message ? <p className="mt-3 text-sm leading-6 text-muted">{message}</p> : null}
    </Surface>
  );
}
