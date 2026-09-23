declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CONTRACT_FILES?: R2Bucket;
  }
}
