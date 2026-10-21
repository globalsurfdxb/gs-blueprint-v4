// Browser-side helper. Hosted serverless functions reject request bodies over ~4.5MB before our code
// runs, which showed up as a bare failure for ordinary full-screen screenshots (QA A-02). Anything
// larger than `maxBytes` is re-encoded in the browser first. Falls back to the original file if the
// browser can't decode it (the server then validates it as usual).

/** One bug screenshot on its own (the bug page's upload). */
export const SINGLE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
/** Up to three screenshots travel in one request (the Report-a-bug form), so each stays small. */
export const MULTI_UPLOAD_BYTES = 1.4 * 1024 * 1024;

export async function shrinkImage(file: File, maxBytes = SINGLE_UPLOAD_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    for (const [maxSide, quality] of [[2400, 0.85], [1800, 0.8], [1400, 0.7], [1100, 0.65]] as const) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#ffffff"; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    return file;
  } catch {
    return file;
  }
}
