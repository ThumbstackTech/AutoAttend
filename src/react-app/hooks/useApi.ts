import { useState, useEffect } from 'react';
import type { EmployeeWithDetails, AttendanceRecordWithEmployee, AttendanceStats, CreateEmployeeRequest, UpdateEmployeeRequest } from '@/shared/types';

// Allow overriding API base for production deployments (e.g. Cloudflare Worker URL)
// Set VITE_API_BASE in your environment (.env, .dev.vars via plugin, or host config)
const API_BASE = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : 'https://019a4ead-1cfb-71c4-914c-dc2317d59ceb.thumbstack-autoattend.workers.dev';

export function useEmployees() {
  const [employees, setEmployees] = useState<EmployeeWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/employees`);
      if (!response.ok) throw new Error('Failed to fetch employees');
      const data = await response.json();
      setEmployees(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const createEmployee = async (employeeData: CreateEmployeeRequest) => {
    const response = await fetch(`${API_BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employeeData),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create employee');
    }
    const newEmployee = await response.json();
    setEmployees(prev => [...prev, newEmployee]);
    return newEmployee;
  };

  const updateEmployee = async (id: number, updates: UpdateEmployeeRequest) => {
    const response = await fetch(`${API_BASE}/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update employee');
    }
    const updated = await response.json();
    setEmployees(prev => prev.map(e => e.id === id ? updated : e));
    return updated as EmployeeWithDetails;
  };

  const deleteEmployee = async (id: number) => {
    const response = await fetch(`${API_BASE}/api/employees/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete employee');
    }
    setEmployees(prev => prev.filter(e => e.id !== id));
    return true;
  };

  const deleteEmployeeHard = async (id: number) => {
    const response = await fetch(`${API_BASE}/api/employees/${id}/hard`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to hard delete employee');
    }
    setEmployees(prev => prev.filter(e => e.id !== id));
    return true;
  };

  return { employees, loading, error, createEmployee, updateEmployee, deleteEmployee, deleteEmployeeHard, refetch: fetchEmployees };
}

export function useAttendance(limit?: number) {
  const [attendance, setAttendance] = useState<AttendanceRecordWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const url = limit ? `${API_BASE}/api/attendance?limit=${limit}` : `${API_BASE}/api/attendance`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch attendance');
      const data = await response.json();
      setAttendance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return { attendance, loading, error, refetch: fetchAttendance };
}

export async function getAttendance(params: {
  limit?: number;
  date?: string;
  month?: string;
  status?: string;
  department?: string;
  role?: string;
  employee_id?: number;
}) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.date) search.set('date', params.date);
  if (params.month) search.set('month', params.month);
  if (params.status) search.set('status', params.status);
  if (params.department) search.set('department', params.department);
  if (params.role) search.set('role', params.role);
  if (params.employee_id) search.set('employee_id', String(params.employee_id));
  const url = `${API_BASE}/api/attendance?${search.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch attendance');
  }
  return res.json() as Promise<AttendanceRecordWithEmployee[]>;
}

export async function exportAttendanceCSV(opts: { date?: string; month?: string; department?: string; role?: string; status?: string; employee_id?: number }) {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  if (opts.month) params.set('month', opts.month);
  if (opts.department) params.set('department', opts.department);
  if (opts.role) params.set('role', opts.role);
  if (opts.status) params.set('status', opts.status);
  if (opts.employee_id) params.set('employee_id', String(opts.employee_id));
  const url = `${API_BASE}/api/attendance/export?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to export attendance CSV');
  }
  const blob = await response.blob();
  return blob;
}

export function useAttendanceStats() {
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/attendance/stats`);
      if (!response.ok) throw new Error('Failed to fetch attendance stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 30 seconds for real-time updates
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading, error, refetch: fetchStats };
}
