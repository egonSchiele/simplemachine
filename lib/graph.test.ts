import { describe, it, expect, vi } from "vitest";
import { Graph } from "./graph.js";
import { GraphError } from "./error.js";
import { conditionalEdge, regularEdge } from "./types.js";

type State = {
  count: number;
  log: string[];
};

describe("Graph", () => {
  describe("node()", () => {
    it("registers a node that can be executed", async () => {
      const graph = new Graph<State, "start">(["start"]);
      graph.node("start", async (data) => ({
        ...data,
        count: data.count + 1,
      }));

      const result = await graph.run("start", { count: 0, log: [] });
      expect(result.count).toBe(1);
    });
  });

  describe("edge()", () => {
    it("creates a regular edge with string destination", async () => {
      const graph = new Graph<State, "a" | "b">(["a", "b"]);
      graph.node("a", async (data) => ({ ...data, log: [...data.log, "a"] }));
      graph.node("b", async (data) => ({ ...data, log: [...data.log, "b"] }));
      graph.edge("a", "b");

      const result = await graph.run("a", { count: 0, log: [] });
      expect(result.log).toEqual(["a", "b"]);
    });

    it("creates a conditional edge with function destination", async () => {
      const graph = new Graph<State, "start" | "high" | "low">(["start", "high", "low"]);
      graph.node("start", async (data) => data);
      graph.node("high", async (data) => ({ ...data, log: ["high"] }));
      graph.node("low", async (data) => ({ ...data, log: ["low"] }));

      graph.conditionalEdge("start", ["high", "low"], async (data) => (data.count >= 5 ? "high" : "low"));

      const highResult = await graph.run("start", { count: 10, log: [] });
      expect(highResult.log).toEqual(["high"]);

      const lowResult = await graph.run("start", { count: 2, log: [] });
      expect(lowResult.log).toEqual(["low"]);
    });

    it("handles edges for nodes defined later", async () => {
      const graph = new Graph<State, "a" | "b">(["a", "b"]);
      graph.edge("a", "b");
      graph.node("a", async (data) => ({ ...data, log: [...data.log, "a"] }));
      graph.node("b", async (data) => ({ ...data, log: [...data.log, "b"] }));

      const result = await graph.run("a", { count: 0, log: [] });
      expect(result.log).toEqual(["a", "b"]);
    });
  });

  describe("run()", () => {
    it("executes a single node and returns transformed data", async () => {
      const graph = new Graph<State, "only">(["only"]);
      graph.node("only", async (data) => ({
        count: data.count * 2,
        log: ["doubled"],
      }));

      const result = await graph.run("only", { count: 5, log: [] });
      expect(result).toEqual({ count: 10, log: ["doubled"] });
    });

    it("follows a chain of regular edges", async () => {
      const graph = new Graph<State, "a" | "b" | "c">(["a", "b", "c"]);
      graph.node("a", async (data) => ({ ...data, count: data.count + 1 }));
      graph.node("b", async (data) => ({ ...data, count: data.count + 2 }));
      graph.node("c", async (data) => ({ ...data, count: data.count + 3 }));

      graph.edge("a", "b");
      graph.edge("b", "c");

      const result = await graph.run("a", { count: 0, log: [] });
      expect(result.count).toBe(6);
    });

    it("handles loop with conditional exit (index.ts pattern)", async () => {
      const graph = new Graph<State, "start" | "increment" | "finish">(["start", "increment", "finish"]);

      graph.node("start", async (data) => ({
        ...data,
        log: [...data.log, "start"],
      }));

      graph.node("increment", async (data) => ({
        ...data,
        count: data.count + 1,
        log: [...data.log, `inc:${data.count + 1}`],
      }));

      graph.node("finish", async (data) => data);

      graph.edge("start", "increment");
      graph.conditionalEdge("increment", ["increment", "finish"], async (data) => {
        if (data.count < 3) {
          return "increment";
        } else {
          return "finish";
        }
      });

      const result = await graph.run("start", { count: 0, log: [] });
      expect(result.count).toBe(3);
      expect(result.log).toEqual(["start", "inc:1", "inc:2", "inc:3"]);
    });

    it("throws GraphError when node function is not registered", async () => {
      const graph = new Graph<State, "a" | "unregistered">(["a", "unregistered"]);
      graph.node("a", async (data) => ({ ...data, log: ["a"] }));
      graph.edge("a", "unregistered");

      await expect(graph.run("a", { count: 0, log: [] })).rejects.toThrow(
        GraphError
      );
      await expect(graph.run("a", { count: 0, log: [] })).rejects.toThrow(
        "Node function for unregistered not found."
      );
    });
  });

  describe("prettyPrintEdge()", () => {
    it("formats regular edge with destination node id", () => {
      const graph = new Graph<State, "nodeA" | "nodeB">(["nodeA", "nodeB"]);
      const edge = regularEdge("nodeB");

      expect(graph.prettyPrintEdge(edge)).toBe("nodeB");
    });

    it("formats conditional edge with adjacent nodes", () => {
      const graph = new Graph<State, "someNode" | "otherNode">(["someNode", "otherNode"]);
      const edge = conditionalEdge<State, "someNode" | "otherNode">(async () => "someNode", ["someNode", "otherNode"]);

      expect(graph.prettyPrintEdge(edge)).toBe("someNode | otherNode");
    });
  });

  describe("prettyPrint()", () => {
    it("logs all edges to console", () => {
      const graph = new Graph<State, "a" | "b" | "c">(["a", "b", "c"]);
      graph.node("a", async (data) => data);
      graph.node("b", async (data) => data);
      graph.node("c", async (data) => data);

      graph.edge("a", "b");
      graph.conditionalEdge("b", ["c"], async () => "c");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      graph.prettyPrint();

      expect(consoleSpy).toHaveBeenCalledWith("a -> b");
      expect(consoleSpy).toHaveBeenCalledWith("b -> c");

      consoleSpy.mockRestore();
    });
  });

  describe("hooks", () => {
    it("calls beforeNode hook before each node execution", async () => {
      const beforeHook = vi.fn(async (nodeId: string, data: State) => ({
        ...data,
        log: [...data.log, `before:${nodeId}`],
      }));

      const graph = new Graph<State, "a" | "b">(["a", "b"], {
        hooks: { beforeNode: beforeHook },
      });
      graph.node("a", async (data) => ({ ...data, log: [...data.log, "a"] }));
      graph.node("b", async (data) => ({ ...data, log: [...data.log, "b"] }));
      graph.edge("a", "b");

      const result = await graph.run("a", { count: 0, log: [] });

      expect(beforeHook).toHaveBeenCalledTimes(2);
      expect(beforeHook).toHaveBeenCalledWith("a", { count: 0, log: [] });
      expect(result.log).toEqual(["before:a", "a", "before:b", "b"]);
    });

    it("calls afterNode hook after each node execution", async () => {
      const afterHook = vi.fn(async (nodeId: string, data: State) => ({
        ...data,
        log: [...data.log, `after:${nodeId}`],
      }));

      const graph = new Graph<State, "a" | "b">(["a", "b"], {
        hooks: { afterNode: afterHook },
      });
      graph.node("a", async (data) => ({ ...data, log: [...data.log, "a"] }));
      graph.node("b", async (data) => ({ ...data, log: [...data.log, "b"] }));
      graph.edge("a", "b");

      const result = await graph.run("a", { count: 0, log: [] });

      expect(afterHook).toHaveBeenCalledTimes(2);
      expect(result.log).toEqual(["a", "after:a", "b", "after:b"]);
    });

    it("calls both beforeNode and afterNode hooks in correct order", async () => {
      const beforeHook = vi.fn(async (nodeId: string, data: State) => ({
        ...data,
        log: [...data.log, `before:${nodeId}`],
      }));
      const afterHook = vi.fn(async (nodeId: string, data: State) => ({
        ...data,
        log: [...data.log, `after:${nodeId}`],
      }));

      const graph = new Graph<State, "a">(["a"], {
        hooks: { beforeNode: beforeHook, afterNode: afterHook },
      });
      graph.node("a", async (data) => ({ ...data, log: [...data.log, "a"] }));

      const result = await graph.run("a", { count: 0, log: [] });

      expect(result.log).toEqual(["before:a", "a", "after:a"]);
    });

    it("passes modified data from beforeNode to node function", async () => {
      const graph = new Graph<State, "a">(["a"], {
        hooks: {
          beforeNode: async (_nodeId, data) => ({
            ...data,
            count: data.count + 10,
          }),
        },
      });
      graph.node("a", async (data) => ({ ...data, count: data.count * 2 }));

      const result = await graph.run("a", { count: 5, log: [] });

      expect(result.count).toBe(30); // (5 + 10) * 2
    });
  });

  describe("validation", () => {
    it("passes when validation succeeds on first try", async () => {
      const validationFunc = vi.fn((data: State) => data.count > 0);

      const graph = new Graph<State, "a">(["a"], {
        validation: { func: validationFunc },
      });
      graph.node("a", async (data) => ({ ...data, count: data.count + 1 }));

      const result = await graph.run("a", { count: 0, log: [] });

      expect(result.count).toBe(1);
      expect(validationFunc).toHaveBeenCalledTimes(1);
    });

    it("retries node execution when validation fails", async () => {
      let callCount = 0;
      const graph = new Graph<State, "a">(["a"], {
        validation: {
          func: (data: State) => data.count >= 3,
          maxRetries: 5,
        },
      });
      graph.node("a", async (data) => {
        callCount++;
        return { ...data, count: callCount };
      });

      const result = await graph.run("a", { count: 0, log: [] });

      expect(result.count).toBe(3);
      expect(callCount).toBe(3);
    });

    it("throws GraphError when validation fails after max retries", async () => {
      const graph = new Graph<State, "a">(["a"], {
        validation: {
          func: () => false, // always fails
          maxRetries: 2,
        },
      });
      graph.node("a", async (data) => data);

      await expect(graph.run("a", { count: 0, log: [] })).rejects.toThrow(
        GraphError
      );
      await expect(graph.run("a", { count: 0, log: [] })).rejects.toThrow(
        "Validation failed for node a after 2 retries."
      );
    });

    it("throws immediately when maxRetries is 0 and validation fails", async () => {
      const graph = new Graph<State, "a">(["a"], {
        validation: {
          func: () => false,
          maxRetries: 0,
        },
      });
      graph.node("a", async (data) => data);

      await expect(graph.run("a", { count: 0, log: [] })).rejects.toThrow(
        "Validation failed for node a after 0 retries."
      );
    });

    it("validates each node in sequence", async () => {
      const validationCalls: number[] = [];
      const graph = new Graph<State, "a" | "b">(["a", "b"], {
        validation: {
          func: (data: State) => {
            validationCalls.push(data.count);
            return true;
          },
        },
      });
      graph.node("a", async (data) => ({ ...data, count: 1 }));
      graph.node("b", async (data) => ({ ...data, count: 2 }));
      graph.edge("a", "b");

      await graph.run("a", { count: 0, log: [] });

      expect(validationCalls).toEqual([1, 2]);
    });
  });

  describe("GraphError", () => {
    it("has correct name property", () => {
      const error = new GraphError("test message");
      expect(error.name).toBe("GraphError");
    });

    it("has correct message property", () => {
      const error = new GraphError("test message");
      expect(error.message).toBe("test message");
    });

    it("is an instance of Error", () => {
      const error = new GraphError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
