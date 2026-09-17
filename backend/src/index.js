// Module 2: User & Role Management
// Starts the backend HTTP server. See src/server.js for routing and
// src/routes/userRoutes.js for the actual role/user logic.

const { createServer } = require('./server');

const PORT = process.env.PORT || 4000;

const server = createServer();
server.listen(PORT, () => {
  console.log(`Healthcare backend listening on http://localhost:${PORT}`);
  console.log('Module 2: User & Role Management endpoints:');
  console.log('  GET  /api/roles   - list supported roles');
  console.log('  POST /api/users   - register a user with a role');
  console.log('  GET  /api/users   - list registered users (in-memory, resets on restart)');
});
