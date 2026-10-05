import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Meme images and avatars are both capped at 5 MB by the Server Actions
      // that receive them, but the framework's own cap is 1 MB and is applied
      // first — without this, a 2 MB upload is rejected before any of that
      // validation runs, and the form just fails. The spare megabyte is for the
      // multipart boundaries and field metadata that ride along with the file.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
