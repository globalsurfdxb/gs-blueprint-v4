import { ImageResponse } from "next/og";
import { BRAND_ICON_SVG } from "@/lib/brand-icon";

// iOS home-screen icon: the same GS monogram as the favicon (src/app/icon.svg), rendered at 180x180.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(BRAND_ICON_SVG).toString("base64")}`;
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={180} height={180} alt="" />
    ),
    { ...size },
  );
}
