"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, X } from "lucide-react";

import { VerificationBadge } from "@/components/canvas/verification-badge";
import { Button } from "@/components/ui/button";
import type { ChatMessage, Solution, SolutionStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChatPanel({
  solution,
  focusedStep,
  messages,
  mobileOpen = false,
  onRequestClose,
  onClearFocusedStep,
  onMessagesChange,
}: {
  solution: Solution | null;
  focusedStep: SolutionStep | null;
  messages: ChatMessage[];
  mobileOpen?: boolean;
  onRequestClose?: () => void;
  onClearFocusedStep: () => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!focusedStep) return;
    setDraft((current) => current || `Why does step ${focusedStep.stepNum} work?`);
  }, [focusedStep]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();
    if (!solution || !message || isSending) return;

    const sentAt = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `pending_user_${Date.now()}`,
      solutionId: solution.id,
      role: "user",
      content: message,
      createdAt: sentAt,
    };
    const assistantMessage: ChatMessage = {
      id: `pending_assistant_${Date.now()}`,
      solutionId: solution.id,
      role: "assistant",
      content: "",
      createdAt: sentAt,
    };

    setDraft("");
    setIsSending(true);
    let latestMessages = [...messages, userMessage, assistantMessage];
    onMessagesChange(latestMessages);

    try {
      const response = await fetch(`/api/v1/solutions/${solution.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          step_num: focusedStep?.stepNum ?? null,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat failed with ${response.status}`);
      }

      await readChatStream(response.body, {
        onToken(token) {
          latestMessages = latestMessages.map((item) =>
            item.id === assistantMessage.id ? { ...item, content: item.content + token } : item,
          );
          onMessagesChange(latestMessages);
        },
        onDone(done) {
          latestMessages = latestMessages.map((item) => {
            if (item.id === userMessage.id) return done.userMessage ?? userMessage;
            if (item.id === assistantMessage.id) return done.assistantMessage ?? assistantMessage;
            return item;
          });
          onMessagesChange(latestMessages);
        },
      });
    } catch {
      latestMessages = latestMessages.map((item) =>
        item.id === assistantMessage.id
          ? {
              ...item,
              content: "I could not answer that follow-up. Try again with a specific step.",
            }
          : item,
      );
      onMessagesChange(latestMessages);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          aria-label="Close chat"
          onClick={onRequestClose}
        />
      ) : null}
      <aside
        className={cn(
          "border-l border-hairline bg-canvas",
          mobileOpen
            ? "fixed inset-y-0 right-0 z-50 flex w-[min(100vw,360px)] flex-col shadow-button lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:shadow-none"
            : "hidden w-80 shrink-0 lg:flex lg:flex-col",
        )}
      >
      <div className="border-b border-hairline p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted" aria-hidden="true" />
            <h2 className="font-medium text-ink">Follow-up chat</h2>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-ink active:bg-surface-soft lg:hidden"
            aria-label="Close chat"
            onClick={onRequestClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {solution ? (
          <div className="mt-3 rounded-md border border-hairline bg-surface-soft p-3">
            <p className="truncate font-hand text-xl leading-6 text-ink">{solution.finalAnswer}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted">{focusedStep ? `Step ${focusedStep.stepNum}` : "Current solution"}</span>
              <VerificationBadge status={focusedStep?.verificationStatus ?? solution.verificationStatus} compact />
            </div>
          </div>
        ) : null}
        {focusedStep ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-info-border/30 bg-canvas px-3 py-2 text-xs text-muted">
            <span className="min-w-0 truncate">Step {focusedStep.stepNum}: {focusedStep.latex}</span>
            <button
              type="button"
              className="shrink-0 rounded-full p-1 text-ink active:bg-surface-soft"
              aria-label="Clear focused step"
              onClick={onClearFocusedStep}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-md p-3 text-sm leading-6",
                message.role === "assistant" ? "bg-surface-soft text-body" : "bg-primary text-white",
              )}
            >
              {message.content || (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Thinking
                </span>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-hairline p-4 text-sm leading-6 text-muted">
            Ask about a step or verification result.
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form className="border-t border-hairline p-4" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-message">
          Ask a follow-up
        </label>
        <div className="flex gap-2">
          <textarea
            id="chat-message"
            className="min-h-11 min-w-0 flex-1 resize-none rounded-sm border border-hairline bg-canvas px-3 py-3 text-sm leading-5 text-ink outline-none focus:border-[#458fff]"
            placeholder={solution ? "Ask about this solution" : "Solve first"}
            rows={1}
            value={draft}
            disabled={!solution || isSending}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="icon" aria-label="Send message" disabled={!solution || isSending || !draft.trim()}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </form>
      </aside>
    </>
  );
}

async function readChatStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onToken: (token: string) => void;
    onDone: (payload: { userMessage?: ChatMessage; assistantMessage?: ChatMessage }) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const eventName = event
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice(7);
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6);

      if (!eventName || !dataLine) continue;

      const payload = JSON.parse(dataLine) as {
        token?: string;
        user_message?: ChatMessage;
        assistant_message?: ChatMessage;
      };

      if (eventName === "token" && payload.token) {
        handlers.onToken(payload.token);
      }

      if (eventName === "done") {
        handlers.onDone({
          userMessage: payload.user_message,
          assistantMessage: payload.assistant_message,
        });
      }
    }
  }
}
