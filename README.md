<<<<<<< HEAD
## AutoAttend

### Local Development

1) Install dependencies
```
npm install
```

2) Apply local D1 migrations (first time or after schema changes)
```
npx wrangler d1 migrations apply 019a4ead-1cfb-71c4-914c-dc2317d59ceb --local
```

3) Configure local env for the Worker (optional but required for login)

Create a `.dev.vars` file in the project root (already scaffolded) and set:
```
MOCHA_USERS_SERVICE_API_URL=<your-mocha-users-service-url>
MOCHA_USERS_SERVICE_API_KEY=<your-api-key>
```

4) Start the dev server (Vite + Cloudflare Worker)
```
npm run dev
```


## ESP32 Integration

The ESP32 scanner posts detections directly to the Worker API.

- Endpoint: `POST /api/esp32/detect`
- Content-Type: `application/json`
- Body:

```
// Check-in (default)
{
	"hex_value": "<ASCII-HEX of employee identifier>"
}

// Explicit checkout
{
	"hex_value": "<ASCII-HEX of employee identifier>",
	"action": "checkout"
}
```

Notes:
- `action` is optional and defaults to `checkin` if omitted.
- The server dedupes repeating events of the same type within 60 seconds and returns `{ success: true, deduped: true }`.
- Stats consider someone “present” if they have a check-in with no later checkout on the same day.

### Notes

	`MOCHA_USERS_SERVICE_API_URL` and `MOCHA_USERS_SERVICE_API_KEY` values in `.dev.vars`.
=======
# Attendance-Sys
>>>>>>> attendance-sys/main
