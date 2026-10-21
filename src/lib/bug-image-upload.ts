import "server-only";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

// Screenshot Attachments on Bugs (PRD 8.2.4) — deliberately narrow limits. Do NOT raise these
// without a product decision. Shared by the "Report a bug" form and the bug's own Screenshots block,
// so both apply exactly the same checks.
export const MAX_BUG_IMAGES = 3;
export const MAX_BUG_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** Defence-in-depth: verify the actual file signature, not just the declared MIME type, so a 40MB
 * video renamed/relabelled as image/png can't slip past the picker's accept filter. */
function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type PreparedBugImage = { file: File; contentType: ImageType };

/** The real files in a form field (an empty file input submits a zero-byte placeholder). */
export function imageFilesFrom(formData: FormData, field = "image"): File[] {
  return formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

export const blobStorageReady = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export const BLOB_NOT_READY_MESSAGE =
  "Screenshot storage isn't set up on this environment yet. Ask an Admin to connect Vercel Blob storage.";

/**
 * Validate files BEFORE anything is created or uploaded: count (with what the bug already has),
 * size, declared type and real file signature. Throws a plain-language error on the first problem.
 */
export async function prepareBugImages(files: File[], alreadyAttached = 0): Promise<PreparedBugImage[]> {
  if (alreadyAttached + files.length > MAX_BUG_IMAGES) {
    throw new Error(
      alreadyAttached > 0
        ? `A bug can have at most ${MAX_BUG_IMAGES} images — remove one first.`
        : `A bug can have at most ${MAX_BUG_IMAGES} screenshots.`,
    );
  }
  const out: PreparedBugImage[] = [];
  for (const file of files) {
    if (file.size > MAX_BUG_IMAGE_BYTES) throw new Error(`“${file.name}” is over 5MB — use a smaller image.`);
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("Only PNG, JPG or WebP images are allowed.");
    const sniffed = sniffImageType(new Uint8Array(await file.arrayBuffer()));
    if (!sniffed) throw new Error(`“${file.name}” isn't a valid PNG, JPG or WebP image.`);
    out.push({ file, contentType: sniffed });
  }
  return out;
}

/** Upload prepared images to Vercel Blob and record a reference for each on the bug. */
export async function storeBugImages(taskId: string, userId: string, images: PreparedBugImage[]) {
  for (const { file, contentType } of images) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "image";
    let blob: Awaited<ReturnType<typeof put>>;
    try {
      blob = await put(`bug-images/${taskId}/${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType,
      });
    } catch (err) {
      console.error("[storeBugImages] blob upload failed", err);
      throw new Error("The screenshot couldn't be uploaded. Please try again, or use a smaller image.");
    }
    await prisma.bugImage.create({
      data: {
        taskId,
        url: blob.url,
        pathname: blob.pathname,
        filename: file.name.slice(0, 200),
        contentType,
        addedById: userId,
      },
    });
  }
}
