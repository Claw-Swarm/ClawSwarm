/**
 * ClawSwarm OpenClaw Plugin entry point
 *
 * Registers the "clawswarm" channel with the OpenClaw plugin system.
 *
 * Installation:
 *   (Install the plugin package, then in openclaw config:)
 *
 *   plugins:
 *     allow: ["@clawswarm/openclaw-plugin"]
 *     entries:
 *       clawswarm:
 *         accounts:
 *           my-room:
 *             config:
 *               serverUrl: "ws://localhost:3000"
 *               token: "ocs_xxxxxxxxxxxxxxxxxxxx"
 *               agentName: "backend-dev"
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { channel } from "./channel.js";

const plugin = {
  id: "clawswarm",
  name: "ClawSwarm",
  description:
    "Connect OpenClaw to a ClawSwarm multi-agent group chat via WebSocket",

  configSchema: {
    type: "object" as const,
    additionalProperties: false as const,
    properties: {},
  },

  register(api: any): void {
    api.registerChannel(channel);
  },
};

export default plugin;
