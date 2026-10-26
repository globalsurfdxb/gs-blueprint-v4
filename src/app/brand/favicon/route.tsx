import { ImageResponse } from "next/og";
import { BRAND_ICON_SVG } from "@/lib/brand-icon";

// /favicon.ico — browsers (and crawlers) still ask for this path by default. It is built from the same GS
// monogram SVG as the tab icon (src/app/icon.svg) and the Apple icon, so the brand colours live in one place.
export const dynamic = "force-static";

const SIZES = [16, 32, 48] as const;

async function renderPng(size: number): Promise<Buffer> {
  const src = `data:image/svg+xml;base64,${Buffer.from(BRAND_ICON_SVG).toString("base64")}`;
  const res = new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={size} height={size} alt="" />
    ),
    { width: size, height: size },
  );
  return Buffer.from(await res.arrayBuffer());
}

/** Wraps PNG images in an ICO container (one directory entry per size). */
function toIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries: Buffer[] = [];
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width
    e.writeUInt8(size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

export async function GET() {
  const images = await Promise.all(SIZES.map(async (size) => ({ size, png: await renderPng(size) })));
  return new Response(new Uint8Array(toIco(images)), {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
