# Movie Pinboard

A shared movie wishlist for 2 people. Each person has a board, you pin movies to each other's board, tick them off, and move watched ones to a Watched board. Anyone can make a room with a name and password, so other couples can use the same site.

- `public/index.html`: the whole front end 
- `api/*.js`: Vercel serverless routes (`auth`, `state`, `movies`, `img`)
- `lib/db.js`: Postgres access; creates its tables on first use
- `lib/auth.js`: signed session cookie


## Run it on your laptop

```
npm install
npm run dev:local        # http://localhost:3000, data kept in ./.data
npm test                 # API checks against an in-memory database
```

one needs to set `DATABASE_URL` to a real Postgres URL if not running on own device, or smth like that. should be no need tbh since its hosted already

## How rooms work / written by claude i was too lazy

- A room has a name, a password and two people. The first person creates it. The second joins with the same room name and password and picks their own name.
- To sign in on another phone, join the room again with the same name you used before.
- Passwords are stored as bcrypt hashes. After 8 wrong guesses a room is locked for 5 minutes.
- Sessions are an HttpOnly cookie that lasts 90 days. "Leave room" only signs out on that device.
- There is no email, so a forgotten room password cannot be reset.
- Posters are shrunk in the browser and stored in the database, so you do not need file storage. A room holds up to 500 movies.
- The page asks the server for changes every 5 seconds while the tab is open (`POLL_MS` in `public/index.html`). Neon's free database sleeps when idle, and this polling keeps it awake while someone has the page open.
