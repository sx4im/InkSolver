"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const payload = {
      event_type: "web_vital",
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      url: window.location.pathname,
      metadata: {
        id: metric.id,
        navigationType: metric.navigationType,
      },
    };

    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/v1/telemetry", new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch("/api/v1/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    });
  });

  return null;
}
