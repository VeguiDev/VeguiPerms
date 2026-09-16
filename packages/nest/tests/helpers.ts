import "reflect-metadata";
import type { DynamicModule, INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";

export interface RunningApp {
  url: string;
  close: () => Promise<void>;
}

export async function startApp(app: INestApplication): Promise<RunningApp> {
  await app.listen(0);
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the app to listen on a TCP address");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => app.close(),
  };
}

export async function withApp<T>(
  app: INestApplication,
  run: (url: string) => Promise<T>,
): Promise<T> {
  const running = await startApp(app);
  try {
    return await run(running.url);
  } finally {
    await running.close();
  }
}

export interface TestAppOptions {
  imports?: DynamicModule[];
  controllers?: Type<unknown>[];
  providers?: Type<unknown>[];
}

export async function createTestApp(
  options: TestAppOptions,
): Promise<INestApplication> {
  const testing = await Test.createTestingModule({
    imports: options.imports ?? [],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  }).compile();
  return testing.createNestApplication();
}
