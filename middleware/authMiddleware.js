import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import dotenv from "dotenv";

dotenv.config();

// ===============================
// Validate Required ENV
// ===============================
if (!process.env.KINDE_ISSUER_URL) {
  console.error("❌ Missing KINDE_ISSUER_URL");
  process.exit(1);
}

if (!process.env.KINDE_AUDIENCE && !process.env.KINDE_CLIENT_ID) {
  console.error("❌ Missing KINDE_AUDIENCE or KINDE_CLIENT_ID");
  process.exit(1);
}

// Remove trailing slash if exists
const issuer = process.env.KINDE_ISSUER_URL.replace(/\/$/, "");

const jwksClient = jwksRsa({
  jwksUri: `${issuer}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5
});

// ===============================
// Get Signing Key
// ===============================
function getKey(header, callback) {
  if (!header || !header.kid) {
    return callback(new Error("Missing token kid"));
  }

  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      return callback(err || new Error("JWKS key not found"));
    }

    const signingKey =
      key.getPublicKey?.() || key.rsaPublicKey;

    callback(null, signingKey);
  });
}

// ===============================
// Require Auth Middleware
// ===============================
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Missing Authorization header"
    });
  }

  // Support case-insensitive "Bearer"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return res.status(401).json({
      error: "Invalid Authorization format"
    });
  }

  const token = parts[1];

  jwt.verify(
    token,
    getKey,
    {
      audience:
        process.env.KINDE_AUDIENCE ||
        process.env.KINDE_CLIENT_ID,
      issuer: issuer,
      algorithms: ["RS256"]
    },
    (err, decoded) => {
      if (err) {
        console.error("JWT Verification Error:", err.message);

        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            error: "Token expired"
          });
        }

        return res.status(401).json({
          error: "Invalid token"
        });
      }

      req.user = {
        id: decoded.sub,
        email: decoded.email,
        raw: decoded
      };

      next();
    }
  );
}
