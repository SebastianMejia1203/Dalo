import type { Response } from "express";
export function requestLifecycle(res: Response, timeoutMs = 60_000) {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onClose);
  return {
    signal: AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(timeoutMs),
    ]),
    dispose: () => {
      res.off("close", onClose);
    },
  };
}
