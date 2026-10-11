# DriveEase Frontend

React + Vite frontend for the DriveEase car-rental project.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed by Vite (usually `http://localhost:5173`). The Spring Boot API should be running on `http://localhost:8080` and MongoDB must be available.

The API base URL defaults to `http://localhost:8080/api`. To change it, create a `.env` file in this folder:

```env
VITE_API_URL=http://localhost:8080/api
```

After changing `.env`, restart Vite.
