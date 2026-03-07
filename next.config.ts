import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Pablo v5 config */
  // NOTE: COOP/COEP headers for WebContainers (SharedArrayBuffer) have been
  // intentionally removed. Applying COOP: same-origin to /session/* pages
  // causes mobile browsers (especially Safari) to break the auth cookie
  // context when navigating from the OAuth callback (non-COOP) into session
  // pages (COOP), manifesting as "redirect to login" on every click.
  //
  // WebContainers will fail to boot without cross-origin isolation, but
  // LivePreview gracefully falls back to srcdoc preview mode which works
  // everywhere. If WebContainer support is needed in the future, serve the
  // WebContainer in a separate cross-origin iframe with its own COOP/COEP.
};

export default nextConfig;
