import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Trash2, Shield, User as UserIcon, Check, AlertCircle } from 'lucide-react';
import { User, useAuth } from '../context/AuthContext';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (toast: { type: 'success' | 'error' | 'info'; title: string; body?: string }) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, onToast }) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!newUsername.trim() || newUsername.trim().length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          display_name: newDisplayName.trim() || newUsername.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }

      onToast({
        type: 'success',
        title: 'User Created',
        body: `Created ${newRole} account "${newUsername.trim()}".`,
      });

      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (targetUser: User, nextRole: 'admin' | 'user') => {
    if (targetUser.id === currentUser?.id) {
      onToast({
        type: 'error',
        title: 'Permission Denied',
        body: 'You cannot change your own admin role.',
      });
      return;
    }

    try {
      const res = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (res.ok) {
        onToast({
          type: 'success',
          title: 'Role Updated',
          body: `Changed ${targetUser.username}'s role to ${nextRole}.`,
        });
        fetchUsers();
      }
    } catch (e: any) {
      onToast({
        type: 'error',
        title: 'Error Updating Role',
        body: e.message || 'Failed to update role.',
      });
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      onToast({
        type: 'error',
        title: 'Permission Denied',
        body: 'You cannot delete your own admin account.',
      });
      return;
    }

    if (!window.confirm(`Delete account "${targetUser.username}"?\nThis will remove their personal collections.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${targetUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        onToast({
          type: 'success',
          title: 'User Deleted',
          body: `Removed account "${targetUser.username}".`,
        });
        fetchUsers();
      }
    } catch (e: any) {
      onToast({
        type: 'error',
        title: 'Error Deleting User',
        body: e.message || 'Failed to delete user.',
      });
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200 overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight leading-snug">
                User & Role Management
              </h2>
              <p className="text-xs text-slate-400">
                Manage sound designer accounts and system administrator privileges.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Users List */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-56 pr-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            Active Accounts ({users.length})
          </div>
          <div className="space-y-1.5">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <div
                  key={u.id}
                  className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs shrink-0">
                      {(u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate flex items-center gap-2">
                        <span>{u.display_name || u.username}</span>
                        {isSelf && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-mono">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        @{u.username} • Joined {u.created_at?.split(' ')[0] || 'Recently'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Role Selector Badge */}
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => handleUpdateRole(u, e.target.value as 'admin' | 'user')}
                      className={`text-[11px] rounded-lg px-2 py-1 font-semibold border cursor-pointer focus:outline-none ${
                        u.role === 'admin'
                          ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300'
                      } ${isSelf ? 'opacity-80 cursor-default' : ''}`}
                    >
                      <option value="user">User (Standard)</option>
                      <option value="admin">Admin (Full Control)</option>
                    </select>

                    {/* Delete Button */}
                    {!isSelf && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600/30 transition cursor-pointer"
                        title={`Delete account @${u.username}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add New User Form */}
        <form onSubmit={handleCreateUser} className="border-t border-slate-800 pt-3 flex flex-col gap-2.5">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Create New User</span>
          </div>

          {errorMsg && (
            <div className="text-[11px] bg-rose-950/50 border border-rose-500/40 text-rose-200 p-2 rounded-lg flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Username (e.g. alexm)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Display Name (e.g. Alex Morgan)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="user">Role: User (Sound Designer)</option>
              <option value="admin">Role: Admin (Full Access)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Account'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
