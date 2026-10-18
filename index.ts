/**
 * pi-vision — Vision tool for pi.
 *
 * Gives vision-less models the ability to "see": the `vision` tool takes an
 * image path (or URL) plus a question, shells out to a vision-capable pi
 * model headlessly, and returns its textual answer. The calling agent never
 * needs image support itself.
 *
 * Configure the vision model with `PI_VISION_MODEL`; default
 * zai-coding-cn/glm-5.3-flash. Timeout via `PI_VISION_TIMEOUT_MS` (default 60s).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_MODEL = "zai-coding-cn/glm-5.3-flash";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_QUESTION = 2000;

function visionModel(): string {
	return process.env.PI_VISION_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
	const n = Number(process.env.PI_VISION_TIMEOUT_MS);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Resolve ~ and relative paths; accept http(s) URLs as-is. */
function resolveTarget(p: string, cwd: string): string {
	if (/^https?:\/\//.test(p)) return p;
	const expanded = p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd, p);
	return expanded;
}

function runPi(args: string[], timeout: number): Promise<string> {
	// NOTE: execFile makes headless pi hang (killed by SIGTERM at the timeout);
	// spawn with stdin ignored works. Verified 2026-10-19.
	return new Promise((resolve, reject) => {
		const child = spawn("pi", args, {
			stdio: ["ignore", "pipe", "pipe"],
			detached: false,
			// Nested pi inherits vars (PI_*) that confuse the child; minimal env instead.
			env: { PATH: process.env.PATH, HOME: process.env.HOME, TERM: "dumb" },
		});
		let out = "";
		let se = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`vision model timed out after ${timeout}ms`));
		}, timeout);
		timer.unref?.();
		child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
		child.stderr?.on("data", (d: Buffer) => (se += d.toString()));
		child.on("error", (e: Error) => {
			clearTimeout(timer);
			reject(new Error(`failed to spawn pi: ${e.message}`));
		});
		child.on("close", (code: number | null) => {
			clearTimeout(timer);
			if (code === 0 && out.trim()) {
				resolve(out.trim());
			} else {
				const tail = (se || out || "").slice(-500);
				reject(new Error(`vision model run failed (exit ${code})${tail ? `\n---\n${tail}` : ""}`));
			}
		});
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "vision",
		description:
			"Describe or analyze an image using a vision-capable model. Use when you cannot see images yourself. " +
			"Input: path to a local image (png/jpg/gif/webp/bmp) or an image URL, plus a question. Returns the vision model's textual answer.",
		parameters: Type.Object({
			path: Type.String({ description: "Image file path (absolute, ~, or relative to cwd) or http(s) URL" }),
			question: Type.String({ description: "What to look for / ask about the image" }),
		}),
		execute: async (_toolCallId: string, args: { path?: string; question?: string }) => {
			const p = typeof args?.path === "string" ? args.path : "";
			const q = typeof args?.question === "string" ? args.question : "Describe this image.";
			if (!p) return { content: [{ type: "text", text: "vision: missing required parameter `path`" }], details: { error: true } };
			const target = resolveTarget(p, pi?.cwd ?? process.cwd());
			const question = q.slice(0, MAX_QUESTION);
			if (!/^https?:\/\//.test(target) && !fs.existsSync(target)) {
				return { output: `image not found: ${target}`, error: true as const };
			}
			try {
				const answer = await runPi(
					["--model", visionModel(), "--print", `@${target}`, "--no-extensions", question],
					timeoutMs(),
				);
				return {
					content: [{ type: "text", text: `[vision:${visionModel()}] ${target}\n${answer || "(empty answer)"}` }],
					details: { model: visionModel(), target },
				};
			} catch (e) {
				return { content: [{ type: "text", text: (e as Error).message }], details: { error: true } };
			}
		},
	});
}
