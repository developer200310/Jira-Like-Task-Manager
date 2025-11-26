Task Manager — Full stack (Express + MongoDB Compass + Vanilla Frontend)

Folders:
- backend/  -> Express server (port 5000)
- frontend/ -> static frontend (open index.html)

Setup backend:
1. Install dependencies:
   cd backend
   npm install

2. Start MongoDB locally (Compass): make sure MongoDB is running on mongodb://127.0.0.1:27017
   or set env MONGO_URI to your connection string.

3. Start server:
   node server.js
   or for dev with nodemon: npm run dev

API endpoints:
- GET /api/tasks
- POST /api/tasks
- PUT /api/tasks/:id
- DELETE /api/tasks/:id
- POST /api/tasks/:id/advance
- POST /api/tasks/:id/assign  (body: { assigneeId })
- GET /api/members
- POST /api/members
- DELETE /api/members/:id

Frontend:
Open frontend/index.html in your browser. It expects the backend at http://localhost:5000

Notes:
- Assignment rule: a member cannot have more than 5 tasks in 'in_progress'. Attempts to assign or advance will be rejected with 400.
- This is a minimal implementation meant for local development / learning.
