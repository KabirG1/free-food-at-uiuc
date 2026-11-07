// Sends a flyer to the read-flyer server function (supabase/functions/read-flyer) and returns its details.

import { supabase } from "./auth.ts";
import { flyerDetails, type FlyerDetails } from "./flyerRules.ts";

/** Plenty for reading a flyer's text, and small enough to upload quickly on a phone connection. */
const LONGEST_SIDE_PIXELS = 1600;

export type FlyerProblem = "unreadable_file" | "daily_limit" | "busy" | "failed";

export class FlyerError extends Error {
  constructor(readonly problem: FlyerProblem) {
    super(problem);
  }
}

/** Redraws the image as a smaller JPEG. This also leaves behind photo data such as where it was taken. */
async function shrinkToJpeg(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new FlyerError("unreadable_file");
  }
  const scale = Math.min(1, LONGEST_SIDE_PIXELS / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // The start of the data address is "data:image/jpeg;base64,", which the server doesn't want.
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export async function readFlyer(file: File): Promise<FlyerDetails> {
  const image = await shrinkToJpeg(file);
  if (supabase === null) {
    throw new FlyerError("failed");
  }
  const { data, error } = await supabase.functions.invoke("read-flyer", { body: { image, mimeType: "image/jpeg" } });
  if (error) {
    throw new FlyerError(await problemFrom(error));
  }
  return flyerDetails(data?.flyer);
}

/** The server's reason for an error is in the response, when it got far enough to send one. */
async function problemFrom(error: { context?: unknown }): Promise<FlyerProblem> {
  if (error.context instanceof Response) {
    const body: unknown = await error.context.json().catch(() => null);
    const reason = (body as { error?: unknown } | null)?.error;
    if (reason === "daily_limit" || reason === "busy") {
      return reason;
    }
  }
  return "failed";
}
