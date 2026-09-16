import type { Server } from "node:http";
import type express from "express";

export type App = ReturnType<typeof express>;

export interface RunningApp {
  url: string;
  close: () => Promise<void>;
}

export function startApp(app: App): Promise<RunningApp> {
  return new Promise((resolve, reject) => {
    const server: Server = app.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected the app to listen on a TCP address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            );
          }),
      });
    });
  });
}

export async function withApp<T>(
  app: App,
  run: (url: string) => Promise<T>,
): Promise<T> {
  const running = await startApp(app);
  try {
    return await run(running.url);
  } finally {
    await running.close();
  }
}
