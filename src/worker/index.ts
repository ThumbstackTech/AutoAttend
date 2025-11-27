import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { 
  CreateEmployeeSchema, 
  UpdateEmployeeSchema,
  ESP32DetectionSchema
} from "@/shared/types";

// Define Env type locally for Worker bindings
type Env = {
  DB: D1Database;
  // R2 bucket is optional; when not bound, OTA endpoints return 501
  R2_BUCKET?: R2Bucket;
};

const AUTH_COOKIE = "AA_AUTH";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const COMPANY_UUID = 'D7E1A3F4';

type AuthenticatedUser = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  must_change_password: number;
};

type AppVariables = {
  user: AuthenticatedUser;
};

function toClientUser(user: { id: number; username: string; email: string | null; role: string; must_change_password: number }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

type EmployeeRow = {
  id: number;
  name: string;
  uuid: string;
  role?: string | null;
  department?: string | null;
  emp_id?: string | null;
};

type EmployeeWithDetailsRow = {
  id: number;
  name: string;
  uuid: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  details_id: number | null;
  hex_value: string | null;
  role: string | null;
  department: string | null;
  emp_id: string | null;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  manager: string | null;
  location: string | null;
  notes: string | null;
  details_created_at: string | null;
  details_updated_at: string | null;
};

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt ?? crypto.randomUUID().replace(/-/g, "");
  const hash = await sha256Hex(actualSalt + password);
  return { hash, salt: actualSalt };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}

function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function isSecureRequest(c: Context): boolean {
  try {
    const url = new URL(c.req.url);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function getAuthenticatedUserFromCookie(c: Context<{ Bindings: Env; Variables: AppVariables }>): Promise<AuthenticatedUser | null> {
  const token = getCookie(c, AUTH_COOKIE);
  if (!token) {
    return null;
  }
  const db = c.env.DB;
  const session = await db.prepare(
    `SELECT s.token, s.expires_at, u.id, u.username, u.email, u.role, u.must_change_password
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
     LIMIT 1`
  ).bind(token).first<{
    token: string;
    expires_at: string;
    id: number;
    username: string;
    email: string | null;
    role: string;
    must_change_password: number;
  }>();

  if (!session) {
    return null;
  }

  const now = Date.now();
  if (new Date(session.expires_at).getTime() < now) {
    await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    return null;
  }

  const extendedExpiry = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(`UPDATE sessions SET expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE token = ?`).bind(extendedExpiry, token).run();

  return {
    id: session.id,
    username: session.username,
    email: session.email,
    role: session.role,
    must_change_password: session.must_change_password,
  };
}

// Enable CORS for ESP32 requests
app.use("/api/*", cors());

// Simple auth middleware and endpoints
const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const user = await getAuthenticatedUserFromCookie(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
};

app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, string>));
  const identifier = (body.identifier ?? body.username ?? '').trim();
  const password = (body.password ?? '').trim();

  if (!identifier || !password) {
    return c.json({ error: 'Username/email and password are required' }, 400);
  }

  const normalized = identifier.toLowerCase();
  const db = c.env.DB;
  const user = await db.prepare(
    `SELECT id, username, email, role, must_change_password, password_hash, password_salt
     FROM users
     WHERE LOWER(username) = ? OR LOWER(email) = ?
     LIMIT 1`
  ).bind(normalized, normalized).first<{
    id: number;
    username: string;
    email: string | null;
    role: string;
    must_change_password: number;
    password_hash: string;
    password_salt: string;
  }>();

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, user.id, expiresAt)
    .run();

  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isSecureRequest(c),
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({
    success: true,
    user: toClientUser(user),
  });
});

app.get('/api/auth/me', async (c) => {
  const user = await getAuthenticatedUserFromCookie(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json(toClientUser(user));
});

app.get('/api/logout', async (c) => {
  const token = getCookie(c, AUTH_COOKIE);
  if (token) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  }
  setCookie(c, AUTH_COOKIE, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isSecureRequest(c),
    maxAge: 0,
  });
  return c.json({ success: true }, 200);
});

app.post('/api/account/password', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, string>));
  const currentPassword = (body.currentPassword ?? '').trim();
  const newPassword = (body.newPassword ?? '').trim();

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Current and new passwords are required' }, 400);
  }

  if (newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters long' }, 400);
  }

  const user = c.get('user');
  const dbUser = await c.env.DB.prepare(`SELECT password_hash, password_salt FROM users WHERE id = ? LIMIT 1`)
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  const isCurrentValid = await verifyPassword(currentPassword, dbUser.password_salt, dbUser.password_hash);
  if (!isCurrentValid) {
    return c.json({ error: 'Current password is incorrect' }, 400);
  }

  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(`
    UPDATE users
    SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(hash, salt, user.id).run();

  return c.json({ success: true });
});

// Helper function to convert hex to string (employee name)
function hexToString(hex: string): string {
  try {
    const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [];
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (error) {
    console.error('Error converting hex to string:', error);
    return '';
  }
}

// Helper function to convert string to hex
function stringToHex(str: string): string {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch (error) {
    console.error('Error converting string to hex:', error);
    return '';
  }
}

// Get all employees with their details (protected route)
app.get("/api/employees", authMiddleware, async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT 
      e.id, e.name, e.uuid, e.is_active, e.created_at, e.updated_at,
      ed.id as details_id, ed.hex_value, ed.role, ed.department, ed.emp_id,
      ed.email, ed.phone, ed.hire_date, ed.manager, ed.location, ed.notes,
      ed.created_at as details_created_at, ed.updated_at as details_updated_at
    FROM employees e
    LEFT JOIN employee_details ed ON e.id = ed.employee_id
    WHERE e.is_active = 1 
    ORDER BY e.name ASC
  `).all();
  
  // Transform the result to include details as nested object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employees = (result.results || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    uuid: row.uuid,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    details: row.details_id ? {
      id: row.details_id,
      employee_id: row.id,
      hex_value: row.hex_value,
      role: row.role,
      department: row.department,
      emp_id: row.emp_id,
      email: row.email,
      phone: row.phone,
      hire_date: row.hire_date,
      manager: row.manager,
      location: row.location,
      notes: row.notes,
      created_at: row.details_created_at,
      updated_at: row.details_updated_at,
    } : null
  }));
  
  return c.json(employees);
});

// Create new employee with detailed information (protected route)
app.post("/api/employees", authMiddleware, zValidator("json", CreateEmployeeSchema), async (c) => {
  const data = c.req.valid("json");
  const db = c.env.DB;
  
  try {
    // Normalize inputs
    const fullName = (data.name || '').trim();
    // Prefer provided hex; else derive from full name
    const providedHex = (data.hex_value || '').toUpperCase();
    const baseHex = providedHex || stringToHex(fullName);

    // If an employee with this hex exists, handle reactivation instead of creating a duplicate
    const existing = await db.prepare(`
      SELECT e.id as employee_id, e.is_active as is_active
      FROM employees e
      JOIN employee_details ed ON e.id = ed.employee_id
      WHERE ed.hex_value = ?
      LIMIT 1
    `).bind(baseHex).first() as { employee_id: number; is_active: number } | null;

    if (existing) {
      if (existing.is_active === 0) {
        // Reactivate: set active, update name and details
        await db.prepare(`UPDATE employees SET name = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(fullName, existing.employee_id).run();

        // Attempt to update details including working_mode, fallback if column absent
        const detParams: Array<string | number | null> = [
          data.role,
          data.department,
          data.emp_id || null,
          data.email || null,
          data.phone || null,
          data.hire_date || null,
          data.manager || null,
          data.location || null,
          data.notes || null,
          (data as unknown as { working_mode?: string }).working_mode || null,
          existing.employee_id,
        ];
        try {
          await db.prepare(`
            UPDATE employee_details 
            SET role = ?, department = ?, emp_id = ?, email = ?, phone = ?, hire_date = ?, manager = ?, location = ?, notes = ?, working_mode = ?, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
          `).bind(...detParams).run();
        } catch {
          await db.prepare(`
            UPDATE employee_details 
            SET role = ?, department = ?, emp_id = ?, email = ?, phone = ?, hire_date = ?, manager = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
          `).bind(
            data.role,
            data.department,
            data.emp_id || null,
            data.email || null,
            data.phone || null,
            data.hire_date || null,
            data.manager || null,
            data.location || null,
            data.notes || null,
            existing.employee_id,
          ).run();
        }

        // Return the reactivated employee record
        const employee = await db.prepare(`
          SELECT 
            e.id, e.name, e.uuid, e.is_active, e.created_at, e.updated_at,
            ed.id as details_id, ed.hex_value, ed.role, ed.department, ed.emp_id,
            ed.email, ed.phone, ed.hire_date, ed.manager, ed.location, ed.notes,
            ed.created_at as details_created_at, ed.updated_at as details_updated_at
          FROM employees e
          LEFT JOIN employee_details ed ON e.id = ed.employee_id
          WHERE e.id = ?
        `).bind(existing.employee_id).first() as unknown as EmployeeWithDetailsRow;

        const responseEmployee = {
          id: employee.id,
          name: employee.name,
          uuid: employee.uuid,
          is_active: employee.is_active,
          created_at: employee.created_at,
          updated_at: employee.updated_at,
          details: {
            id: employee.details_id,
            employee_id: employee.id,
            hex_value: employee.hex_value,
            role: employee.role,
            department: employee.department,
            emp_id: employee.emp_id,
            email: employee.email,
            phone: employee.phone,
            hire_date: employee.hire_date,
            manager: employee.manager,
            location: employee.location,
            notes: employee.notes,
            created_at: employee.details_created_at,
            updated_at: employee.details_updated_at,
          }
        };
        return c.json(responseEmployee);
      }
      // Exists and active: if user provided an explicit hex, block; otherwise we will derive a unique one below
    }

    // Preflight ensure hex uniqueness in employee_details
    let hexToUse = baseHex;
    const hexExists = await db.prepare(`SELECT id FROM employee_details WHERE hex_value = ? LIMIT 1`).bind(hexToUse).first();
    if (hexExists) {
      if (providedHex) {
        return c.json({ error: "Hex value already exists. Please use a unique Hex Value for this employee." }, 400);
      }
      // Try to derive a unique hex by suffixing the full name (" <n>") and encoding
      let uniqueFound = false;
      for (let i = 2; i <= 10; i++) {
        const candidate = stringToHex(`${fullName} ${i}`);
        const exists = await db.prepare(`SELECT id FROM employee_details WHERE hex_value = ? LIMIT 1`).bind(candidate).first();
        if (!exists) { hexToUse = candidate; uniqueFound = true; break; }
      }
      if (!uniqueFound) {
        return c.json({ error: "Unable to derive a unique Hex automatically. Please provide a unique Hex Value." }, 400);
      }
    }

    // Start a transaction-like approach (D1 doesn't support transactions)
    // First create the employee
    // Generate a unique per-employee identifier to satisfy UNIQUE constraint on employees.uuid
    const generatedUuid = (typeof crypto !== 'undefined' && typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID === 'function')
      ? (crypto as unknown as { randomUUID: () => string }).randomUUID()
      : `emp-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const employeeResult = await db.prepare(`
      INSERT INTO employees (name, uuid, hex_value, is_active)
      VALUES (?, ?, ?, 1)
    `).bind(
      fullName,
      generatedUuid,
      hexToUse
    ).run();
    console.log('👤 Creating employee:', { name: data.name, uuid: generatedUuid });
    
    if (!employeeResult.success) {
      return c.json({ error: "Failed to create employee" }, 500);
    }
    
  const employeeId = employeeResult.meta.last_row_id;
  // We'll reuse the chosen hex for details
  const hexValue = hexToUse;
    
    // Then create the employee details
    // Try inserting with working_mode if the column exists; otherwise fallback without it
    let detailsResult;
    try {
      detailsResult = await db.prepare(`
        INSERT INTO employee_details (
          employee_id, hex_value, role, department, emp_id, 
          email, phone, hire_date, manager, location, notes, working_mode
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        employeeId,
        hexValue,
        data.role,
        data.department,
        data.emp_id || null,
        data.email || null,
        data.phone || null,
        data.hire_date || null,
        data.manager || null,
        data.location || null,
        data.notes || null,
  ((data as unknown as { working_mode?: string }).working_mode) || 'Office'
      ).run();
    } catch {
      detailsResult = await db.prepare(`
        INSERT INTO employee_details (
          employee_id, hex_value, role, department, emp_id, 
          email, phone, hire_date, manager, location, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        employeeId,
        hexValue,
        data.role,
        data.department,
        data.emp_id || null,
        data.email || null,
        data.phone || null,
        data.hire_date || null,
        data.manager || null,
        data.location || null,
        data.notes || null
      ).run();
    }
    
    if (!detailsResult.success) {
      // If details creation fails, we should delete the employee
      await db.prepare(`DELETE FROM employees WHERE id = ?`).bind(employeeId).run();
      return c.json({ error: "Failed to create employee details" }, 500);
    }
    
    // Return the complete employee with details
    const employee = await db.prepare(`
      SELECT 
        e.id, e.name, e.uuid, e.is_active, e.created_at, e.updated_at,
        ed.id as details_id, ed.hex_value, ed.role, ed.department, ed.emp_id,
        ed.email, ed.phone, ed.hire_date, ed.manager, ed.location, ed.notes,
        ed.created_at as details_created_at, ed.updated_at as details_updated_at
      FROM employees e
      LEFT JOIN employee_details ed ON e.id = ed.employee_id
    WHERE e.id = ?
  `).bind(employeeId).first() as unknown as EmployeeWithDetailsRow;
    
    const responseEmployee = {
      id: employee.id,
      name: employee.name,
      uuid: employee.uuid,
      is_active: employee.is_active,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
      details: {
        id: employee.details_id,
        employee_id: employee.id,
        hex_value: employee.hex_value,
        role: employee.role,
        department: employee.department,
        emp_id: employee.emp_id,
        email: employee.email,
        phone: employee.phone,
        hire_date: employee.hire_date,
        manager: employee.manager,
        location: employee.location,
        notes: employee.notes,
        created_at: employee.details_created_at,
        updated_at: employee.details_updated_at,
      }
    };
    
    return c.json(responseEmployee);
  } catch (error) {
    console.error('Database error:', error);
    return c.json({ error: "Failed to create employee. Name, hex value, or employee ID may already exist." }, 400);
  }
});

  // Update employee (name/active) and details (role, department, contacts, hex_value)
  app.patch("/api/employees/:id", authMiddleware, zValidator("json", UpdateEmployeeSchema), async (c) => {
    const employeeId = parseInt(c.req.param("id"));
    const data = c.req.valid("json");
    const db = c.env.DB;

    try {
      // Build update for employees table
      const empSets: string[] = [];
      const empParams: Array<string | number> = [];
      if (typeof data.name !== 'undefined') { empSets.push('name = ?'); empParams.push(data.name); }
      if (typeof data.hex_value !== 'undefined') { empSets.push('hex_value = ?'); empParams.push(data.hex_value); }
      if (typeof data.is_active !== 'undefined') { empSets.push('is_active = ?'); empParams.push(data.is_active); }

      if (empSets.length) {
        await db.prepare(`UPDATE employees SET ${empSets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(...empParams, employeeId).run();
      }

      // Build update for employee_details table
      const detSets: string[] = [];
      const detParams: Array<string | number | null> = [];
      if (typeof data.hex_value !== 'undefined') { detSets.push('hex_value = ?'); detParams.push(data.hex_value); }
      if (typeof data.role !== 'undefined') { detSets.push('role = ?'); detParams.push(data.role); }
      if (typeof data.department !== 'undefined') { detSets.push('department = ?'); detParams.push(data.department); }
      if (typeof data.emp_id !== 'undefined') { detSets.push('emp_id = ?'); detParams.push(data.emp_id ?? null); }
      if (typeof data.email !== 'undefined') { detSets.push('email = ?'); detParams.push(data.email ?? null); }
      if (typeof data.phone !== 'undefined') { detSets.push('phone = ?'); detParams.push(data.phone ?? null); }
      if (typeof data.hire_date !== 'undefined') { detSets.push('hire_date = ?'); detParams.push(data.hire_date ?? null); }
      if (typeof data.manager !== 'undefined') { detSets.push('manager = ?'); detParams.push(data.manager ?? null); }
      if (typeof data.location !== 'undefined') { detSets.push('location = ?'); detParams.push(data.location ?? null); }
      if (typeof data.notes !== 'undefined') { detSets.push('notes = ?'); detParams.push(data.notes ?? null); }
      if (typeof (data as unknown as { working_mode?: string }).working_mode !== 'undefined') {
        const wm = (data as unknown as { working_mode?: string }).working_mode ?? null;
        detSets.push('working_mode = ?'); detParams.push(wm);
      }

      if (detSets.length) {
        try {
          await db.prepare(`UPDATE employee_details SET ${detSets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?`)
            .bind(...detParams, employeeId).run();
  } catch {
          // Retry excluding working_mode in case the column doesn't exist yet
          const filteredSets: string[] = [];
          const filteredParams: Array<string | number | null> = [];
          detSets.forEach((set, idx) => {
            if (!set.startsWith('working_mode')) {
              filteredSets.push(set);
              filteredParams.push(detParams[idx]);
            }
          });
          if (filteredSets.length) {
            await db.prepare(`UPDATE employee_details SET ${filteredSets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?`)
              .bind(...filteredParams, employeeId).run();
          }
        }
      }

      // Return updated record
      const employee = await db.prepare(`
        SELECT 
          e.id, e.name, e.uuid, e.is_active, e.created_at, e.updated_at,
          ed.id as details_id, ed.hex_value, ed.role, ed.department, ed.emp_id,
          ed.email, ed.phone, ed.hire_date, ed.manager, ed.location, ed.notes,
          ed.created_at as details_created_at, ed.updated_at as details_updated_at
        FROM employees e
        LEFT JOIN employee_details ed ON e.id = ed.employee_id
        WHERE e.id = ?
      `).bind(employeeId).first() as unknown as EmployeeWithDetailsRow | undefined;

      if (!employee) return c.json({ error: 'Employee not found' }, 404);

      const responseEmployee = {
        id: employee.id,
        name: employee.name,
        uuid: employee.uuid,
        is_active: employee.is_active,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
        details: employee.details_id ? {
          id: employee.details_id,
          employee_id: employee.id,
          hex_value: employee.hex_value,
          role: employee.role,
          department: employee.department,
          emp_id: employee.emp_id,
          email: employee.email,
          phone: employee.phone,
          hire_date: employee.hire_date,
          manager: employee.manager,
          location: employee.location,
          notes: employee.notes,
          created_at: employee.details_created_at,
          updated_at: employee.details_updated_at,
        } : null
      };

      return c.json(responseEmployee);
    } catch (error) {
      console.error('Update error:', error);
      return c.json({ error: 'Failed to update employee' }, 400);
    }
  });

  // Soft delete (deactivate) employee
  app.delete("/api/employees/:id", authMiddleware, async (c) => {
    const employeeId = parseInt(c.req.param("id"));
    const db = c.env.DB;

    try {
      const result = await db.prepare(`UPDATE employees SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(employeeId).run();
      if (!result.success) return c.json({ error: 'Failed to deactivate employee' }, 400);
      return c.json({ success: true });
    } catch (error) {
      console.error('Delete error:', error);
      return c.json({ error: 'Failed to delete employee' }, 400);
    }
  });

// ESP32 detection endpoint - now searches by hex value in employee_details
app.post("/api/esp32/detect", zValidator("json", ESP32DetectionSchema), async (c) => {
  const { hex_value, action } = c.req.valid("json");
  const db = c.env.DB;

  // First try to find employee by direct hex value match (details table)
  let employee = await db.prepare(`
    SELECT e.id, e.name, e.uuid, ed.role, ed.department, ed.emp_id
    FROM employees e
    JOIN employee_details ed ON e.id = ed.employee_id
    WHERE ed.hex_value = ? AND e.is_active = 1
  `).bind(hex_value).first() as unknown as EmployeeRow;

  // If not found by direct hex match, try converting hex to string and searching by name
  if (!employee) {
    const employeeName = hexToString(hex_value);

    if (!employeeName) {
      return c.json({ error: "Invalid hex value - cannot convert to employee name" }, 400);
    }

    employee = await db.prepare(`
      SELECT e.id, e.name, e.uuid, ed.role, ed.department, ed.emp_id
      FROM employees e
      LEFT JOIN employee_details ed ON e.id = ed.employee_id
      WHERE LOWER(e.name) = LOWER(?) AND e.is_active = 1
    `).bind(employeeName).first() as unknown as EmployeeRow;
  }

  if (!employee) {
    return c.json({ 
      error: "Employee not found", 
      details: `No active employee found with hex value '${hex_value}'`
    }, 404);
  }

  // Determine event type; default to checkin if not provided
  const status: 'checkin' | 'checkout' = (action === 'checkout' ? 'checkout' : 'checkin');
  const now = new Date();

  // Check the employee's most recent attendance record (regardless of time)
  const lastRecord = await db.prepare(`
    SELECT status FROM attendance_records 
    WHERE employee_id = ? 
    ORDER BY recorded_at DESC LIMIT 1
  `).bind(employee.id).first<{ status: string }>();

  // Block consecutive check-ins: if last record was check-in and new request is also check-in, reject
  if (lastRecord && lastRecord.status === 'checkin' && status === 'checkin') {
    return c.json({ 
      success: false, 
      error: "Duplicate check-in blocked",
      message: `Employee ${employee.name} is already checked in. Please checkout first.`
    }, 400);
  }

  // Block consecutive checkouts: if last record was checkout and new request is also checkout, reject
  if (lastRecord && lastRecord.status === 'checkout' && status === 'checkout') {
    return c.json({ 
      success: false, 
      error: "Duplicate checkout blocked",
      message: `Employee ${employee.name} is already checked out. Please checkin first.`
    }, 400);
  }

  // Additional dedupe: ignore if a same-status event exists in last 60 seconds (for rapid duplicates)
  const recent = await db.prepare(`
    SELECT id FROM attendance_records 
    WHERE employee_id = ? AND status = ? 
      AND datetime(recorded_at) >= datetime(? , '-60 seconds')
    ORDER BY recorded_at DESC LIMIT 1
  `).bind(employee.id, status, now.toISOString()).first();
  if (recent) {
    return c.json({ success: true, deduped: true });
  }

  // Insert attendance (populate both uuid and company_uuid with constant value)
  const result = await db.prepare(`
    INSERT INTO attendance_records (
      employee_id,
      uuid,
      company_uuid,
      hex_value,
      status,
      recorded_at,
      day_of_week,
      date,
      time,
      month,
      year
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    employee.id,
    COMPANY_UUID,
    COMPANY_UUID,
    hex_value,
    status,
    now.toISOString(),
    now.toLocaleDateString('en-US', { weekday: 'long' }),
    now.toISOString().split('T')[0],
    now.toTimeString().split(' ')[0],
    now.toLocaleDateString('en-US', { month: 'long' }),
    now.getFullYear()
  ).run();
  
  if (result.success) {
    const response = { 
      success: true, 
      employee_name: employee.name,
      employee_role: employee.role,
  employee_department: employee.department,
      employee_emp_id: employee.emp_id,
      status: status,
      recorded_at: now.toISOString(),
      timestamp_details: {
        day: now.toLocaleDateString('en-US', { weekday: 'long' }),
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        month: now.toLocaleDateString('en-US', { month: 'long' }),
        year: now.getFullYear()
      }
    };
    
    console.log(`✅ Attendance recorded: ${employee.name} (${employee.role}) - ${status} at ${now.toISOString()}`);
    return c.json(response);
  } else {
    return c.json({ error: "Failed to record attendance" }, 500);
  }
});

// Hard delete employee and related records (attendance + details)
app.delete("/api/employees/:id/hard", authMiddleware, async (c) => {
  const employeeId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  try {
    // Remove attendance records
    await db.prepare(`DELETE FROM attendance_records WHERE employee_id = ?`).bind(employeeId).run();
    // Remove details
    await db.prepare(`DELETE FROM employee_details WHERE employee_id = ?`).bind(employeeId).run();
    // Remove employee
    const result = await db.prepare(`DELETE FROM employees WHERE id = ?`).bind(employeeId).run();
    if (!result.success) return c.json({ error: 'Failed to delete employee' }, 400);
    return c.json({ success: true });
  } catch (error) {
    console.error('Hard delete error:', error);
    return c.json({ error: 'Failed to hard delete employee' }, 400);
  }
});

// Get attendance records with detailed filtering options and employee details (protected route)
app.get("/api/attendance", authMiddleware, async (c) => {
  const db = c.env.DB;
  const limit = c.req.query("limit") || "100";
  const date = c.req.query("date"); // YYYY-MM-DD format
  const month = c.req.query("month"); // YYYY-MM
  const employee_id = c.req.query("employee_id");
  const status = c.req.query("status"); // checkin or checkout
  const department = c.req.query("department");
  const role = c.req.query("role");
  
  let query = `
    SELECT 
      ar.id,
      ar.employee_id,
      ar.company_uuid,
      ar.hex_value,
      ar.status,
      ar.recorded_at,
      ar.day_of_week,
      ar.date,
      ar.time,
      ar.month,
      ar.year,
      ar.created_at,
      ar.updated_at,
      e.name as employee_name,
      ed.role as employee_role,
      ed.department as employee_department,
      ed.emp_id as employee_emp_id
    FROM attendance_records ar
    JOIN employees e ON ar.employee_id = e.id
    LEFT JOIN employee_details ed ON e.id = ed.employee_id
    WHERE 1=1
  `;
  
  const params: Array<string | number> = [];
  
  if (date) {
    query += ` AND ar.date = ?`;
    params.push(date);
  }
  if (month) {
    query += ` AND ar.date LIKE ?`;
    params.push(`${month}-%`);
  }
  
  if (employee_id) {
    query += ` AND ar.employee_id = ?`;
    params.push(parseInt(employee_id));
  }
  
  if (status) {
    query += ` AND ar.status = ?`;
    params.push(status);
  }
  
  if (department) {
    query += ` AND ed.department = ?`;
    params.push(department);
  }
  
  if (role) {
    query += ` AND ed.role = ?`;
    params.push(role);
  }
  
  query += ` ORDER BY ar.recorded_at DESC LIMIT ?`;
  params.push(parseInt(limit));
  
  const result = await db.prepare(query).bind(...params).all();
  
  return c.json(result.results || []);
});

// Get attendance for specific employee (protected route)
app.get("/api/employees/:id/attendance", authMiddleware, async (c) => {
  const employeeId = c.req.param("id");
  const db = c.env.DB;
  const limit = c.req.query("limit") || "50";
  
  const result = await db.prepare(`
    SELECT 
      ar.id,
      ar.employee_id,
      ar.company_uuid,
      ar.hex_value,
      ar.status,
      ar.recorded_at,
      ar.day_of_week,
      ar.date,
      ar.time,
      ar.month,
      ar.year,
      ar.created_at,
      ar.updated_at,
      e.name as employee_name,
      ed.role as employee_role,
      ed.department as employee_department,
      ed.emp_id as employee_emp_id
    FROM attendance_records ar
    JOIN employees e ON ar.employee_id = e.id
    LEFT JOIN employee_details ed ON e.id = ed.employee_id
    WHERE ar.employee_id = ?
    ORDER BY ar.recorded_at DESC
    LIMIT ?
  `).bind(parseInt(employeeId), parseInt(limit)).all();
  
  return c.json(result.results || []);
});

// Get attendance statistics (protected route)
app.get("/api/attendance/stats", authMiddleware, async (c) => {
  const db = c.env.DB;
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's check-ins
  const todayCheckins = await db.prepare(`
    SELECT COUNT(*) as count 
    FROM attendance_records 
    WHERE date = ? AND status = 'checkin'
  `).bind(today).first() as { count: number };
  
  // Get currently present employees (checked in but not checked out today)
  const currentlyPresent = await db.prepare(`
    SELECT COUNT(DISTINCT employee_id) as count
    FROM attendance_records ar1
    WHERE ar1.date = ? 
    AND ar1.status = 'checkin'
    AND NOT EXISTS (
      SELECT 1 FROM attendance_records ar2 
      WHERE ar2.employee_id = ar1.employee_id 
      AND ar2.date = ? 
      AND ar2.status = 'checkout'
      AND ar2.recorded_at > ar1.recorded_at
    )
  `).bind(today, today).first() as { count: number };
  
  // Get total active employees
  const totalEmployees = await db.prepare(`
    SELECT COUNT(*) as count 
    FROM employees 
    WHERE is_active = 1
  `).first() as { count: number };
  
  return c.json({
    today_checkins: todayCheckins.count,
    currently_present: currentlyPresent.count,
    total_employees: totalEmployees.count,
    date: today
  });
});

export default app;

// CSV export endpoint (protected)
app.get('/api/attendance/export', authMiddleware, async (c) => {
  const db = c.env.DB;
  const date = c.req.query('date'); // YYYY-MM-DD
  const month = c.req.query('month'); // YYYY-MM
  const department = c.req.query('department');
  const role = c.req.query('role');
  const status = c.req.query('status');
  const employee_id = c.req.query('employee_id');

  if (!date && !month) {
    return c.json({ error: 'Provide either ?date=YYYY-MM-DD or ?month=YYYY-MM' }, 400);
  }

  // Build base query
  let query = `
    SELECT 
      ar.id,
      ar.employee_id,
      ar.company_uuid,
      ar.hex_value,
      ar.status,
      ar.recorded_at,
      ar.day_of_week,
      ar.date,
      ar.time,
      ar.month,
      ar.year,
      e.name as employee_name,
      ed.role as employee_role,
      ed.department as employee_department,
      ed.emp_id as employee_emp_id
    FROM attendance_records ar
    JOIN employees e ON ar.employee_id = e.id
    LEFT JOIN employee_details ed ON e.id = ed.employee_id
    WHERE 1=1
  `;

  const params: Array<string> = [];

  if (date) {
    query += ' AND ar.date = ?';
    params.push(date);
  }
  if (month) {
    // Match YYYY-MM- prefix
    query += ' AND ar.date LIKE ?';
    params.push(`${month}-%`);
  }
  if (department) {
    query += ' AND ed.department = ?';
    params.push(department);
  }
  if (role) {
    query += ' AND ed.role = ?';
    params.push(role);
  }
  if (status) {
    query += ' AND ar.status = ?';
    params.push(status);
  }
  if (employee_id) {
    query += ' AND ar.employee_id = ?';
    params.push(employee_id);
  }

  query += ' ORDER BY ar.date ASC, ar.time ASC';

  const result = await db.prepare(query).bind(...params).all();
  const rows = (result.results || []) as Array<{
    date: string; time: string; employee_name: string; employee_role: string | null; employee_department: string | null; status: string; hex_value: string; employee_emp_id: string | null;
  }>;

  // Compute break annotations similar to UI (group by employee+date)
  type Row = typeof rows[number];
  const byKey = new Map<string, Row[]>();
  rows.forEach(r => {
    const key = `${r.employee_name}|${r.date}`; // employee_id not selected; using name as proxy
    const list = byKey.get(key) || [];
    list.push(r);
    byKey.set(key, list);
  });
  const annotations: Record<string, { breakType?: string; breakDuration?: string; first?: boolean; last?: boolean }> = {};
  for (const [, list] of byKey) {
    const sorted = list.slice().sort((a,b) => new Date(a.time ? `${a.date}T${a.time}` : a.date).getTime() - new Date(b.time ? `${b.date}T${b.time}` : b.date).getTime());
    let lastCheckoutTs: number | null = null;
    let firstCheckinId: string | null = null;
    let lastCheckoutId: string | null = null;
    for (const r of sorted) {
      const ts = new Date(r.time ? `${r.date}T${r.time}` : r.date).getTime();
      const idKey = `${r.date}|${r.time}|${r.employee_name}|${r.status}`;
      if (r.status === 'checkin') {
        if (firstCheckinId == null) firstCheckinId = idKey;
        if (lastCheckoutTs != null) {
          const diff = (ts - lastCheckoutTs) / 1000;
          const format = (seconds: number) => {
            const s = Math.max(0, Math.floor(seconds));
            const m = Math.floor(s / 60); const rem = s % 60;
            if (m === 0) return `${rem}s`; if (rem === 0) return `${m}m`; return `${m}m ${rem}s`;
          };
          if (diff < 5*60) annotations[idKey] = { breakType: 'Short break', breakDuration: format(diff) };
          else if (diff >= 10*60) annotations[idKey] = { breakType: 'Lunch break', breakDuration: format(diff) };
          else annotations[idKey] = { breakType: 'Break', breakDuration: format(diff) };
        }
      } else if (r.status === 'checkout') {
        lastCheckoutTs = ts; lastCheckoutId = idKey;
      }
    }
    if (firstCheckinId) annotations[firstCheckinId] = { ...(annotations[firstCheckinId] || {}), first: true };
    if (lastCheckoutId) annotations[lastCheckoutId] = { ...(annotations[lastCheckoutId] || {}), last: true };
  }

  // Headers with break columns
  const headers = ['Date','Time','Employee','Status','Break Type','Break Duration','First Of Day','Last Of Day','Hex Value','Employee ID'];
  const csvLines = [headers.join(',')];
  for (const r of rows) {
    const idKey = `${r.date}|${r.time}|${r.employee_name}|${r.status}`;
    const ann = annotations[idKey] || {};
    const line = [
      r.date,
      r.time,
      r.employee_name,
      r.status,
      ann.breakType || '',
      ann.breakDuration || '',
      ann.first ? 'yes' : '',
      ann.last ? 'yes' : '',
      r.hex_value,
      r.employee_emp_id || ''
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
    csvLines.push(line);
  }

  const csvContent = csvLines.join('\n');
  const filenameBase = date ? date : month ? month : 'attendance';
  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${filenameBase}.csv"`
    }
  });
});

// ==========================
// OTA Endpoints (R2-backed)
// ==========================

// Public: manifest describing latest firmware
app.get('/api/ota/manifest', async (c) => {
  const r2 = c.env.R2_BUCKET;
  if (!r2) return c.json({ error: 'OTA disabled (no R2 bucket bound)' }, 501);
  const obj = await r2.get('ota/manifest.json');
  if (!obj) return c.json({ error: 'No manifest found' }, 404);
  const text = await obj.text();
  const data = JSON.parse(text);
  if (!data.download_url && data.key) {
    data.download_url = `/api/ota/download?key=${encodeURIComponent(data.key)}`;
  }
  return c.json(data);
});

// Public: stream firmware from R2
app.get('/api/ota/download', async (c) => {
  const r2 = c.env.R2_BUCKET;
  if (!r2) return c.json({ error: 'OTA disabled (no R2 bucket bound)' }, 501);
  const key = c.req.query('key');
  let downloadKey = key || '';
  if (!downloadKey) {
    const man = await r2.get('ota/manifest.json');
    if (!man) return c.json({ error: 'No manifest found' }, 404);
    const data = JSON.parse(await man.text());
    downloadKey = data.key;
  }
  if (!downloadKey) return c.json({ error: 'Missing key' }, 400);
  const obj = await r2.get(downloadKey);
  if (!obj) return c.json({ error: 'Firmware not found' }, 404);
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(obj.size || 0),
      'Content-Disposition': 'attachment; filename="firmware.bin"'
    }
  });
});

// Protected: upload new firmware + update manifest
app.post('/api/ota/upload', authMiddleware, async (c) => {
  const r2 = c.env.R2_BUCKET;
  if (!r2) return c.json({ error: 'OTA disabled (no R2 bucket bound)' }, 501);
  const form = await c.req.formData();
  const version = String(form.get('version') || '').trim();
  const file = form.get('firmware');
  if (!version) return c.json({ error: 'version is required' }, 400);
  if (!(file instanceof File)) return c.json({ error: 'firmware file required' }, 400);

  const buf = await file.arrayBuffer();
  const size = buf.byteLength;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const hashArray = Array.from(new Uint8Array(hash));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const key = `ota/firmware-${version}.bin`;
  await r2.put(key, buf, {
    httpMetadata: {
      contentType: 'application/octet-stream'
    }
  });

  const manifest = {
    version,
    key,
    size,
    sha256,
    uploaded_at: new Date().toISOString(),
  };
  await r2.put('ota/manifest.json', JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
  return c.json({ ok: true, manifest, download_url: `/api/ota/download?key=${encodeURIComponent(key)}` });
});
