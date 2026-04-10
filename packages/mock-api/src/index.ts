import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { MockApiResponse } from "@benchmark/dataset";

export interface StartedMockApiServer {
  baseUrl: string;
  port: number;
  close(): Promise<void>;
}

export interface StartMockApiServerOptions {
  dashboardPayload: MockApiResponse;
  port?: number;
}

export async function startMockApiServer(
  options: StartMockApiServerOptions
): Promise<StartedMockApiServer> {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === "/api/dashboard") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(options.dashboardPayload));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

