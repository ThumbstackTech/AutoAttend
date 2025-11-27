import { useState } from 'react';
import { useAuth } from "@/react-app/hooks/useAuth";
import { Shield, Users, Clock } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('Pass@123');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="w-full max-w-md">
        {/* Header Section */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <div
              aria-label="AutoAttend Logo"
              className="flex items-center justify-center w-16 h-16 text-2xl font-bold text-white shadow-lg rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600"
            >
              AA
            </div>
          </div>
          <h1 className="mb-2 text-4xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text">
            AutoAttend
          </h1>
          <p className="text-lg text-gray-600">
            Smart Attendance Tracking System
          </p>
          <p className="mt-2 text-sm text-gray-500">
            HR/Admin Access Required
          </p>
        </div>

        {/* Login Card */}
        <div className="p-8 bg-white border border-gray-200 shadow-xl rounded-2xl backdrop-blur-sm">
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-purple-100">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-gray-900">
              Secure Access Portal
            </h2>
            <p className="text-gray-600">
              Sign in with your authorized Google account to access the employee management system
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Pass@123"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 font-semibold text-white transition bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="p-4 mt-6 border border-blue-200 bg-blue-50 rounded-xl">
            <p className="mb-2 text-sm font-medium text-blue-800">
              For authorized personnel only
            </p>
            <p className="text-xs text-blue-700">
              This system is restricted to HR staff and administrators. Unauthorized access is prohibited.
            </p>
          </div>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-2 gap-4 mt-8">
          <div className="p-4 border bg-white/60 backdrop-blur-sm rounded-xl border-white/50">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Employee Management</span>
            </div>
          </div>
          <div className="p-4 border bg-white/60 backdrop-blur-sm rounded-xl border-white/50">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Attendance Tracking</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            AutoAttend v2.0 - ESP32 Powered Attendance System
          </p>
        </div>
      </div>
    </div>
  );
}
