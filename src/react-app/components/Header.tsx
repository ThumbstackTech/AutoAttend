import { useAuth } from "@/react-app/hooks/useAuth";
import { useLocation, Link } from "react-router";
import { LogOut, Users, Clock, BarChart3, Menu, X, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import OtaModal from '@/react-app/components/OtaModal';

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [otaOpen, setOtaOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Employees', href: '/employees', icon: Users },
    { name: 'Attendance', href: '/attendance', icon: Clock },
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-4">
            <div
              aria-label="AutoAttend Logo"
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold"
            >
              AA
            </div>
            <div>
              <h1 className="text-xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text">
                AutoAttend
              </h1>
              <p className="hidden text-xs text-gray-500 sm:block">Employee Management System</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden space-x-1 md:flex">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {/* OTA Button */}
            <button
              onClick={() => setOtaOpen(true)}
              className="items-center hidden px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg sm:inline-flex hover:bg-teal-700"
              title="OTA Update"
            >
              <UploadCloud className="w-4 h-4 mr-2" /> OTA Update
            </button>
            {/* User Info */}
            <div className="items-center hidden space-x-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.username || 'Admin'}</p>
                <p className="text-xs text-gray-500">HR Admin</p>
              </div>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                <span className="text-sm font-medium text-white">
                  {(user?.username || 'A').charAt(0).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 transition-colors rounded-lg hover:text-red-600 hover:bg-red-50"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-500 rounded-lg md:hidden hover:text-gray-700 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="py-4 border-t border-gray-200 md:hidden">
            <nav className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            
            {/* Mobile User Info */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="px-4 mb-3">
                <button
                  onClick={() => { setMobileMenuOpen(false); setOtaOpen(true); }}
                  className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  <UploadCloud className="w-4 h-4 mr-2" /> OTA Update
                </button>
              </div>
              <div className="flex items-center px-4 space-x-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                  <span className="font-medium text-white">
                    {(user?.username || 'A').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{user?.username || 'Admin'}</p>
                  <p className="text-sm text-gray-500">HR Administrator</p>
                </div>
              </div>
            </div>
          </div>
        )}
        {otaOpen && <OtaModal onClose={() => setOtaOpen(false)} />}
      </div>
    </header>
  );
}
