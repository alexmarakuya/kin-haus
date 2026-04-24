import type { APIRoute } from "astro";
import fs from "node:fs";
import { findIncome, receiptFilePath } from "../../../../lib/income.ts";
import { jsonError } from "../../../../lib/api-response.ts";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) {
      return new Response("Not found", { status: 404 });
    }

    const income = findIncome(id);
    if (!income?.imageFilename) {
      return new Response("Not found", { status: 404 });
    }

    const fullPath = receiptFilePath(income.imageFilename);
    if (!fs.existsSync(fullPath)) {
      return new Response("Not found", { status: 404 });
    }

    const ext = income.imageFilename.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    const buf = fs.readFileSync(fullPath);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/income/:id/file] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
