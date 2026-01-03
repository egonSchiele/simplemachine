import { nanoid } from "nanoid";
import { JSONEdge } from "./types.js";

export class StatelogClient {
  private host: string;
  private debug: boolean;
  private tid: string;

  constructor(host: string, debug: boolean = false) {
    this.host = host;
    this.debug = debug;
    this.tid = nanoid();
    if (this.debug)
      console.log(
        `Statelog client initialized with host: ${host} and TID: ${this.tid}`
      );
  }

  logDebug(message: string, data: Record<string, any>): void {
    this.post({
      type: "debug",
      message: message,
      data,
    });
  }

  logGraph({
    nodes,
    edges,
    startNode,
  }: {
    nodes: string[];
    edges: Record<string, JSONEdge[]>;
    startNode?: string;
  }): void {
    this.post({
      type: "graph",
      data: {
        nodes,
        edges,
        startNode,
      },
    });
  }

  post(body: Record<string, any>): void {
    const fullUrl = new URL("/api/logs", this.host);
    const url = fullUrl.toString();

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tid: this.tid,
        ...body,
        timeStamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      if (this.debug) console.error("Failed to send statelog:", err);
    });
  }
}
