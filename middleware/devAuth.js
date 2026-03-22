// backend/devAuth.js

export function devAuth(req, res, next) {
  // Simulated authenticated user
  req.user = {
    id: "dev-user-001",
    email: "dev@example.com",
  };

  next();
}
