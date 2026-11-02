export default {
  resolve: { alias: { "@": new URL("../../web/src", import.meta.url).pathname, "server-only": new URL("./server-only.ts", import.meta.url).pathname } },
  server: { fs: { strict: false } },
};
