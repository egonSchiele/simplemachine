import { nanoid } from "nanoid";
import config from "./config.js";

export class StatelogClient {
  private host: string | undefined;
  private tid: string;

  constructor(host: string | undefined) {
    this.host = process.env.STATELOG_HOST;
    this.tid = nanoid()
    if (host) {
      console.log(`Statelog client initialized with host: ${host} and TID: ${this.tid}`);
    }
  }

  log(data: Record<string, any>): void {
    if (this.host) {
      const fullUrl = new URL("/api/logs", this.host);
      const url = fullUrl.toString();

      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({

          tid: this.tid,
          data,
          timestamp: new Date().toISOString()

        })
      }).catch((err) => {
        console.error("Failed to send statelog:", err);
      });
    }
  }
}

let statelogClient: StatelogClient;
export function getStatelogClient() {
  if (!statelogClient) {
    statelogClient = new StatelogClient(config.statelogHost);
  }
  return statelogClient;
}
