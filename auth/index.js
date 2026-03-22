import { requireAuth } from "../authMiddleware.js";
import { devAuth } from "../devAuth.js";

export function authSwitch(req, res, next) {
  if (process.env.AUTH_MODE === "prod") {
    return requireAuth(req, res, next);
  }

  // default: dev
  return devAuth(req, res, next);
}
