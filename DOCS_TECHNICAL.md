# AutoAttend Technical Documentation

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Deployment Guide](#deployment-guide)
3. [Database Schema](#database-schema)
4. [API Reference](#api-reference)
5. [ESP32 Beacon Setup](#esp32-beacon-setup)
6. [Maintenance & Operations](#maintenance--operations)
7. [Security & Access Control](#security--access-control)
8. [Troubleshooting](#troubleshooting)

---

## System Architecture

### Overview

AutoAttend is a distributed attendance tracking system built on:
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **IoT Layer**: ESP32 microcontroller as BLE beacon + Employee smartphone apps
- **Deployment**: Cloudflare Pages + Workers

### Component Diagram

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│ Employee Phones │────────▶│  ESP32 Beacon    │         │ Cloudflare      │
│ (Scanning App)  │  BLE    │  (Office Entry)  │         │   Worker API    │
└────────┬────────┘         └──────────────────┘         └────────┬────────┘
         │                                                         │
         │                   Advertises UUID D7E1A3F4             │
         │                                                         │
         └─────────────────────────HTTPS───────────────────────────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │   D1 Database   │
                                                          │   (SQLite)      │
                                                          └─────────────────┘
                                                                   │
                                                                   │
                            ┌──────────────────────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │   React Frontend   │
                  │  (HR Dashboard)    │
                  └────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19, TypeScript, TailwindCSS | User interface for HR/managers |
| Routing | React Router v7 | Client-side navigation |
| Backend API | Hono (Cloudflare Workers) | Serverless HTTP endpoints |
| Database | Cloudflare D1 (SQLite) | Employee & attendance storage |
| Authentication | Session-based cookies | Multi-user login system |
| IoT Beacon | Arduino C++ (ESP32) | BLE advertising (stationary) |
| Mobile App | Smartphone BLE scanner | Employee devices detect beacon |
| Deployment | Wrangler CLI | CI/CD to Cloudflare edge |

### Data Flow

1. **Beacon Detection**:
   - ESP32 office beacon continuously advertises BLE signal with UUID `D7E1A3F4`
   - Employee smartphone app scans and detects beacon within range (5-10 meters)
   - Phone app runs in background, automatically detecting when employee enters/exits office

2. **Event Transmission**:
   - Phone app POSTs to `/api/esp32/detect` with `{"hex_value":"...", "action":"checkin"}`
   - Hex value is unique employee identifier configured in phone app
   - Worker validates hex against `employee_details` table
   - Dedupe logic prevents duplicate consecutive check-ins

3. **Database Recording**:
   - Worker inserts record into `attendance_records` with timestamp
   - Enriched with employee metadata (name, role, department)
   - Frontend polls or subscribes for real-time updates

4. **Dashboard Display**:
   - React app fetches `/api/attendance?date=YYYY-MM-DD`
   - Renders cards with employee status, times, and stats
   - Auto-refreshes every 30 seconds

---

## Deployment Guide

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers & D1 enabled
- Wrangler CLI installed globally: `npm install -g wrangler`
- Git repository access

### Initial Setup

#### 1. Clone Repository

```bash
git clone https://github.com/ThumbstackTech/AutoAttend.git
cd AutoAttend
npm install
```

#### 2. Authenticate Wrangler

```bash
npx wrangler login
```

Follow browser prompts to authorize.

#### 3. Create D1 Database

```bash
npx wrangler d1 create autoattend-db
```

Copy the `database_id` from output and update `wrangler.json`:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "autoattend-db",
      "database_id": "YOUR_DATABASE_ID_HERE"
    }
  ]
}
```

#### 4. Run Database Migrations

**Local (for development)**:
```bash
npx wrangler d1 migrations apply autoattend-db --local
```

**Remote (for production)**:
```bash
npx wrangler d1 migrations apply autoattend-db --remote
```

This creates:
- `employees` table
- `employee_details` table
- `attendance_records` table
- `users` table (for authentication)
- `sessions` table (for login tracking)

#### 5. Build & Deploy

```bash
npm run build
npx wrangler deploy
```

Output shows your worker URL:
```
Published auto (VERSION)
  https://auto.thumbstack-autoattend.workers.dev
```

### Verifying Deployment

1. **Check Worker Status**:
   ```bash
   npx wrangler deployments list
   ```

2. **Test API Health**:
   ```bash
   curl https://auto.thumbstack-autoattend.workers.dev/api/auth/me
   ```
   Should return `{"error":"Unauthorized"}` (expected when not logged in).

3. **Test Login**:
   ```bash
   curl -X POST https://auto.thumbstack-autoattend.workers.dev/api/login \
     -H "Content-Type: application/json" \
     -d '{"identifier":"Admin","password":"Pass@123"}'
   ```
   Should return `{"success":true,"user":{...}}`.

4. **Access Dashboard**:
   Open `https://auto.thumbstack-autoattend.workers.dev` in browser and login.

### Local Development

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5175`
- Worker simulation via `@cloudflare/vite-plugin`
- Hot module reload for instant updates

**Important**: Local dev uses a separate D1 instance. Apply migrations with `--local` flag first.

---

## Database Schema

### Tables Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `employees` | Core employee records | id, name, uuid, is_active |
| `employee_details` | Extended metadata + employee hex | hex_value, role, department, email |
| `attendance_records` | Check-in/out events | employee_id, status, recorded_at |
| `users` | Admin/HR authentication | username, email, password_hash, role |
| `sessions` | Login session tracking | token, user_id, expires_at |

### Schema Details

#### `employees`
```sql
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  uuid TEXT NOT NULL UNIQUE,
  hex_value TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `employee_details`
```sql
CREATE TABLE employee_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  hex_value TEXT UNIQUE,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  working_mode TEXT DEFAULT 'Office',
  emp_id TEXT,
  email TEXT,
  phone TEXT,
  hire_date DATE,
  manager TEXT,
  location TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
```

#### `attendance_records`
```sql
CREATE TABLE attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  company_uuid TEXT,
  hex_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('checkin','checkout','short_break','lunch_break')),
  break_duration_seconds INTEGER,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  day_of_week TEXT,
  date TEXT,
  time TEXT,
  month TEXT,
  year INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

#### `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_attendance_employee_id ON attendance_records(employee_id);
CREATE INDEX idx_attendance_recorded_at ON attendance_records(recorded_at);
CREATE INDEX idx_attendance_date ON attendance_records(date);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_users_email ON users(email);
```

### Seeded Data

Default users created by migration `7.sql`:

| Username | Email | Role | Password | Must Change |
|----------|-------|------|----------|-------------|
| Admin | admin@thumbstack.co | admin | Pass@123 | No |
| himanshu.k | himanshu.k@thumbstack.co | hr | Pass@123 | Yes |
| ritesh.k | ritesh.k@thumbstack.co | hr | Pass@123 | Yes |
| keyur.a | keyur.a@thumbstack.co | hr | Pass@123 | Yes |

---

## API Reference

### Authentication Endpoints

#### `POST /api/login`
Login with username/email and password.

**Request**:
```json
{
  "identifier": "Admin",
  "password": "Pass@123"
}
```

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "Admin",
    "email": "admin@thumbstack.co",
    "role": "admin",
    "mustChangePassword": false
  }
}
```

Sets `AA_AUTH` cookie with session token.

#### `GET /api/auth/me`
Get current logged-in user.

**Response** (200):
```json
{
  "id": 1,
  "username": "Admin",
  "email": "admin@thumbstack.co",
  "role": "admin",
  "mustChangePassword": false
}
```

#### `GET /api/logout`
Destroy current session.

**Response** (200):
```json
{
  "success": true
}
```

#### `POST /api/account/password`
Change password for logged-in user.

**Request**:
```json
{
  "currentPassword": "Pass@123",
  "newPassword": "MyNewSecurePass123!"
}
```

**Response** (200):
```json
{
  "success": true
}
```

### Employee Endpoints

#### `GET /api/employees`
List all active employees with details.

**Auth**: Required

**Response** (200):
```json
[
  {
    "id": 1,
    "name": "Hrithik Nagpure",
    "uuid": "emp-uuid-123",
    "is_active": 1,
    "created_at": "2025-11-20T00:00:00.000Z",
    "updated_at": "2025-11-20T00:00:00.000Z",
    "details": {
      "id": 1,
      "employee_id": 1,
      "hex_value": "4872697468696B",
      "role": "Intern",
      "department": "IOT/Embedded Developer",
      "emp_id": "EMP01",
      "email": "hrithik@thumbstack.co",
      "phone": "+91-1234567890",
      "hire_date": "2025-01-01",
      "manager": "John Doe",
      "location": "Mumbai Office",
      "working_mode": "Office",
      "notes": "IoT team member",
      "created_at": "2025-11-20T00:00:00.000Z",
      "updated_at": "2025-11-20T00:00:00.000Z"
    }
  }
]
```

#### `POST /api/employees`
Create new employee.

**Auth**: Required

**Request**:
```json
{
  "name": "John Doe",
  "uuid": "D7E1A3F4",
  "hex_value": "4A6F686E446F65",
  "role": "Employee",
  "department": "Engineering",
  "working_mode": "Office",
  "emp_id": "EMP02",
  "email": "john@example.com",
  "phone": "+91-9876543210",
  "hire_date": "2025-01-15",
  "manager": "Jane Smith",
  "location": "Mumbai Office",
  "notes": "New hire"
}
```

**Response** (200): Returns created employee object.

#### `PATCH /api/employees/:id`
Update employee information.

**Auth**: Required

**Request**:
```json
{
  "name": "John Doe Updated",
  "role": "Senior Engineer",
  "email": "john.updated@example.com",
  "is_active": 1
}
```

**Response** (200): Returns updated employee object.

#### `DELETE /api/employees/:id`
Soft-delete (deactivate) employee.

**Auth**: Required

**Response** (200):
```json
{
  "success": true
}
```

#### `DELETE /api/employees/:id/hard`
Permanently delete employee and all attendance records.

**Auth**: Required

**Response** (200):
```json
{
  "success": true
}
```

### Attendance Endpoints

#### `POST /api/esp32/detect`
Record check-in or check-out event (called by employee smartphone app).

**Auth**: None (public endpoint for IoT devices)

**Request**:
```json
{
  "hex_value": "4872697468696B",
  "action": "checkin"
}
```

**Response** (200):
```json
{
  "success": true,
  "employee_name": "Hrithik Nagpure",
  "employee_role": "Intern",
  "employee_department": "IOT/Embedded Developer",
  "employee_emp_id": "EMP01",
  "status": "checkin",
  "recorded_at": "2025-12-03T06:12:17.392Z",
  "timestamp_details": {
    "day": "Tuesday",
    "date": "2025-12-03",
    "time": "06:12:17",
    "month": "December",
    "year": 2025
  }
}
```

**Deduplication**: Returns `{"success":true, "deduped":true}` if same status posted within 60 seconds.

#### `GET /api/attendance`
Query attendance records with filters.

**Auth**: Required

**Query Parameters**:
- `limit` (default: 100) - Max records to return
- `date` - Filter by specific date (YYYY-MM-DD)
- `month` - Filter by month (YYYY-MM)
- `employee_id` - Filter by employee ID
- `status` - Filter by status (`checkin`, `checkout`)
- `department` - Filter by department name
- `role` - Filter by job role

**Example**:
```
GET /api/attendance?date=2025-12-03&department=Engineering
```

**Response** (200):
```json
[
  {
    "id": 1,
    "employee_id": 1,
    "company_uuid": "D7E1A3F4",
    "hex_value": "4872697468696B",
    "status": "checkin",
    "recorded_at": "2025-12-03T09:00:00.000Z",
    "day_of_week": "Tuesday",
    "date": "2025-12-03",
    "time": "09:00:00",
    "month": "December",
    "year": 2025,
    "employee_name": "Hrithik Nagpure",
    "employee_role": "Intern",
    "employee_department": "IOT/Embedded Developer",
    "employee_emp_id": "EMP01"
  }
]
```

#### `GET /api/attendance/stats`
Get today's attendance statistics.

**Auth**: Required

**Response** (200):
```json
{
  "today_checkins": 15,
  "currently_present": 12,
  "total_employees": 20,
  "date": "2025-12-03"
}
```

#### `GET /api/attendance/export`
Export attendance records as CSV.

**Auth**: Required

**Query Parameters**: Same as `/api/attendance`

**Response** (200):
```
Content-Type: text/csv
Content-Disposition: attachment; filename="attendance_2025-12-03.csv"

Employee Name,Role,Department,Status,Date,Time
Hrithik Nagpure,Intern,IOT/Embedded Developer,checkin,2025-12-03,09:00:00
...
```

### OTA (Over-The-Air) Update Endpoints

#### `GET /api/ota/manifest`
Get latest firmware version info for ESP32 beacon.

**Response** (200):
```json
{
  "version": "1.0.1",
  "key": "firmware-v1.0.1.bin",
  "description": "Bug fixes and performance improvements"
}
```

Returns 501 if R2 bucket not configured.

#### `GET /api/ota/download`
Download firmware binary.

**Query Parameters**:
- `key` - R2 object key (from manifest)

**Response** (200):
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="firmware.bin"

[binary data]
```

---

## ESP32 Beacon Setup

### Hardware Requirements

- ESP32 DevKit (any variant with BLE support)
- USB cable for programming
- 5V power supply (or USB power bank for stationary placement)
- Stable WiFi network access

### Firmware Configuration

Edit `ESP32/Scanner.cpp` before compiling:

**Note**: Despite the filename "Scanner.cpp", this firmware configures the ESP32 as a BLE **beacon/advertiser**, not a scanner. Employee smartphones scan for this beacon.

```cpp
// WiFi credentials
const char* WIFI_SSID = "YourNetworkName";
const char* WIFI_PASS = "YourNetworkPassword";

// Server URL (update after each deployment)
const char* SERVER_HOST = "https://auto.thumbstack-autoattend.workers.dev";

// Firmware version (increment for OTA updates)
static const char* CURRENT_FIRMWARE_VERSION = "1.0.0";

// Office UUID that this beacon advertises
const char* TARGET_UUID = "D7E1A3F4";
```

### Compiling & Uploading

**Using Arduino IDE**:

1. Install Arduino IDE 2.x
2. Add ESP32 board support:
   - File → Preferences → Additional Board URLs
   - Add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install required libraries:
   - `BLEDevice` (included with ESP32 core)
4. Open `ESP32/Scanner.cpp`
5. Select board: **ESP32 Dev Module**
6. Select COM port
7. Click **Upload**

**Using PlatformIO**:

```bash
cd ESP32
pio run --target upload
```

### Beacon Placement

- **Entry Points**: Place near main office entrance/exit at fixed location
- **Range**: ESP32 BLE advertisement range is ~10-30 meters (adjustable with antenna)
- **Power**: Ensure stable power supply (USB or DC adapter) - must remain powered on
- **Network**: Must have WiFi connectivity to allow OTA updates
- **Height**: Mount at waist-to-chest height for optimal smartphone detection

**Important**: The ESP32 remains stationary and acts as a beacon. Employee phones detect it when entering range.

### Monitoring Beacon Health

1. **Serial Monitor**: Connect via USB and open serial at 115200 baud
2. **Log Output**: Beacon prints advertising status, WiFi connection, OTA check results
3. **LED Indicators** (if wired):
   - Blue blink: BLE advertising active
   - Green: WiFi connected
   - Red: WiFi disconnected

### OTA Update Process

1. **Build New Firmware**:
   ```bash
   cd ESP32
   arduino-cli compile --fqbn esp32:esp32:esp32 Scanner.cpp
   ```

2. **Upload to Cloudflare R2**:
   ```bash
   npx wrangler r2 object put autoattend-ota/firmware-v1.0.1.bin \
     --file Scanner.ino.bin
   ```

3. **Update Manifest**:
   Create `ota_manifest.json` in R2:
   ```json
   {
     "version": "1.0.1",
     "key": "firmware-v1.0.1.bin",
     "description": "Bug fixes"
   }
   ```

4. **Automatic Update**:
   - ESP32 checks manifest every 10 minutes
   - Downloads & flashes if new version detected
   - Reboots automatically

---

## Maintenance & Operations

### Regular Tasks

**Daily**:
- Monitor dashboard for check-in anomalies
- Verify beacon is powered and advertising (serial logs or WiFi heartbeat)
- Check for stuck sessions (employees not checked out)

**Weekly**:
- Review attendance reports for patterns
- Backup database (see below)
- Clear old session tokens (auto-expired after 7 days)

**Monthly**:
- Audit user accounts (remove departed staff)
- Update beacon firmware if new version available
- Review and optimize database indexes

### Database Backup

**Manual Backup**:
```bash
npx wrangler d1 execute autoattend-db --remote \
  --command ".backup /tmp/autoattend-backup.db"
```

**Automated Backup** (via cron):
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
npx wrangler d1 execute autoattend-db --remote \
  --command ".dump" > backups/autoattend-$DATE.sql
```

### Viewing Logs

**Worker Logs**:
```bash
npx wrangler tail
```

This streams real-time logs from your Worker (HTTP requests, errors, console.log output).

**Database Queries**:
```bash
npx wrangler d1 execute autoattend-db --remote \
  --command "SELECT * FROM attendance_records ORDER BY recorded_at DESC LIMIT 10"
```

### Clearing Test Data

**Delete All Attendance Records**:
```bash
npx wrangler d1 execute autoattend-db --remote \
  --command "DELETE FROM attendance_records;"
```

**Reset Specific Date**:
```bash
npx wrangler d1 execute autoattend-db --remote \
  --command "DELETE FROM attendance_records WHERE date = '2025-12-03';"
```

### Adding New HR Users

1. Generate password hash:
   ```bash
   node -e "
   const crypto = require('crypto');
   const password = 'TempPass123';
   const salt = crypto.randomBytes(16).toString('hex');
   const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
   console.log({salt, hash});
   "
   ```

2. Insert user:
   ```bash
   npx wrangler d1 execute autoattend-db --remote --command "
   INSERT INTO users (username, email, password_hash, password_salt, role, must_change_password)
   VALUES ('new.user', 'new.user@thumbstack.co', 'HASH_FROM_STEP_1', 'SALT_FROM_STEP_1', 'hr', 1);
   "
   ```

3. Share temporary password with user (they'll be forced to change it).

---

## Security & Access Control

### Authentication Flow

1. User submits username/email + password to `/api/login`
2. Worker queries `users` table, verifies password hash (SHA-256 with salt)
3. On success, generates random session token, stores in `sessions` table
4. Sets `AA_AUTH` HTTP-only cookie with token
5. Subsequent requests include cookie; middleware validates against `sessions`
6. Session expires after 7 days or manual logout

### Password Requirements

- Minimum 8 characters
- Must contain mix of uppercase, lowercase, numbers recommended
- Stored as salted SHA-256 hash (never plaintext)
- HR users forced to change default password on first login

### Role-Based Access

| Role | Permissions |
|------|------------|
| `admin` | Full access: manage employees, view/export attendance, manage users |
| `hr` | View/export attendance, manage employees (cannot manage users) |

Future: Extend schema with granular permissions table.

### Network Security

- **HTTPS Only**: All traffic encrypted via Cloudflare SSL
- **CORS**: Enabled for `/api/*` to allow ESP32 posts
- **Cookie Security**: `HttpOnly`, `Secure`, `SameSite=Lax` flags set
- **Rate Limiting**: Consider adding Cloudflare WAF rules for login attempts

### Secrets Management

- Never commit passwords or API keys to Git
- Use Wrangler secrets for sensitive config:
  ```bash
  npx wrangler secret put SECRET_NAME
  ```
- Access in Worker via `c.env.SECRET_NAME`

---

## Troubleshooting

### Worker Deployment Issues

**Problem**: `Migration X failed with errors`  
**Solution**:
- Check SQL syntax in `migrations/X.sql`
- Ensure no `BEGIN TRANSACTION`/`COMMIT` statements (D1 restriction)
- Re-run: `npx wrangler d1 migrations apply autoattend-db --remote`

**Problem**: `Authentication error [code: 10000]`  
**Solution**:
```bash
npx wrangler logout
npx wrangler login
```

**Problem**: Build fails with TypeScript errors  
**Solution**:
```bash
npm run build
# Fix reported errors
npm run dev  # Test locally first
```

### Frontend Issues

**Problem**: "Login Failed" despite correct credentials  
**Check**:
1. Inspect Network tab (F12) → check `/api/login` response
2. Verify `users` table has seeded data:
   ```bash
   npx wrangler d1 execute autoattend-db --remote \
     --command "SELECT username,email FROM users;"
   ```
3. Clear browser cookies and try again

**Problem**: Attendance records not showing  
**Check**:
1. Verify date filter (might be set to past date)
2. Check if employees are active: `/api/employees`
3. Inspect API response: Network tab → `/api/attendance`

### ESP32 Scanner Issues

**Problem**: Scanner not detecting badges  
**Debug**:
1. Open Serial Monitor (115200 baud)
2. Look for:
   - `"WiFi connected"` message
   - `"🔍 Scanning..."` every 6 seconds
   - `"Target UUID MATCH FOUND"` when badge detected

**Solutions**:
- Verify `TARGET_UUID` matches badge broadcast
- Increase scan time: `int scanTime = 5;` in `loop()`
- Check badge battery and BLE transmission power

**Problem**: Scanner detects but doesn't POST  
**Check Serial Output**:
- `"WiFi not connected"` → fix credentials
- `"POST failed with code XXX"` → check server URL
- `"SSL handshake failed"` → time sync issue (reboot ESP32)

**Fix WiFi**:
```cpp
// Verify these match your network
const char* WIFI_SSID = "CorrectName";
const char* WIFI_PASS = "CorrectPassword";
```

**Problem**: OTA update not applying  
**Debug**:
1. Check serial: `"🔄 Checking OTA manifest..."`
2. Verify R2 bucket configured in `wrangler.json`
3. Ensure manifest JSON exists in R2
4. Check firmware version mismatch

### Database Issues

**Problem**: Duplicate hex_value error  
**Cause**: Trying to create employee with existing badge  
**Solution**:
```bash
# Find existing employee with that hex
npx wrangler d1 execute autoattend-db --remote \
  --command "SELECT e.name, ed.hex_value FROM employees e JOIN employee_details ed ON e.id=ed.employee_id WHERE ed.hex_value='4872697468696B';"
```
Either deactivate old employee or use different hex value.

**Problem**: "No such table: users"  
**Cause**: Migration 7 not applied  
**Solution**:
```bash
npx wrangler d1 migrations apply autoattend-db --remote
```

### Performance Optimization

**Slow Attendance Queries**:
- Ensure indexes exist:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance_records(employee_id);
  ```
- Limit query results: Add `LIMIT 100` to SQL
- Use date filters instead of fetching all records

**High Worker CPU Usage**:
- Reduce ESP32 scan frequency (increase `delay()` in loop)
- Batch attendance inserts if needed
- Cache employee lookups (consider KV storage)

---

## Appendix

### Environment Variables

| Variable | Purpose | Set Via |
|----------|---------|---------|
| `DB` | D1 database binding | `wrangler.json` |
| `R2_BUCKET` | OTA firmware storage | `wrangler.json` (optional) |
| Custom secrets | API keys, etc. | `wrangler secret put` |

### Useful Commands Reference

```bash
# Deploy worker
npx wrangler deploy

# Tail logs in real-time
npx wrangler tail

# List deployments
npx wrangler deployments list

# Run migrations locally
npx wrangler d1 migrations apply autoattend-db --local

# Run migrations remotely
npx wrangler d1 migrations apply autoattend-db --remote

# Execute SQL query
npx wrangler d1 execute autoattend-db --remote --command "SQL_HERE"

# Upload file to R2
npx wrangler r2 object put BUCKET/key --file path/to/file

# List R2 objects
npx wrangler r2 object list BUCKET

# Create new secret
npx wrangler secret put SECRET_NAME

# List secrets
npx wrangler secret list
```

### Migration Files

Located in `migrations/` directory:

1. `1.sql` - Create employees table
2. `2.sql` - Create attendance_records table
3. `3.sql` - Add employee_details table
4. `4.sql` - Add working_mode column
5. `5.sql` - Add UUID indexes
6. `6.sql` - Restructure attendance for break support
7. `7.sql` - Add users and sessions tables

### API HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request processed successfully |
| 201 | Created | New resource created (employee, etc.) |
| 400 | Bad Request | Invalid JSON, missing required fields |
| 401 | Unauthorized | Not logged in or session expired |
| 404 | Not Found | Employee/record doesn't exist |
| 500 | Internal Error | Database failure, Worker exception |

### Support Contacts

- **Technical Issues**: it@thumbstack.co
- **HR Questions**: hr@thumbstack.co
- **Emergency**: (Internal IT Helpdesk Number)

---

**Document Version**: 1.0  
**Last Updated**: December 2025  
**System Version**: AutoAttend v1.0.0  
**Maintained By**: IT Department, Thumbstack Technologies
