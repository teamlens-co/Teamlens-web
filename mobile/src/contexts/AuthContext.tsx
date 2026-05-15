import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import type { User } from '../types';

const TOKEN_KEY = 'teamlens_access_token';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (fullName: string, email: string, password: string, organizationName: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => null,
  signup: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          api.setToken(storedToken);
          const result = await api.getMe();
          if (result.ok && result.data) {
            setUser(result.data);
          } else {
            // Token expired — clear
            await SecureStore.deleteItemAsync(TOKEN_KEY);
            api.setToken(null);
          }
        }
      } catch {
        // Ignore errors on startup
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const result = await api.login(email, password);
    if (result.ok && result.data) {
      await SecureStore.setItemAsync(TOKEN_KEY, result.data.accessToken);
      api.setToken(result.data.accessToken);
      // Fetch full user data with organization
      const meResult = await api.getMe();
      setUser(meResult.data || result.data.user);
      return null;
    }
    return result.message || 'Invalid credentials';
  }, []);

  const signup = useCallback(async (
    fullName: string, email: string, password: string, organizationName: string
  ): Promise<string | null> => {
    const result = await api.signup(fullName, email, password, organizationName);
    if (result.ok && result.data) {
      await SecureStore.setItemAsync(TOKEN_KEY, result.data.accessToken);
      api.setToken(result.data.accessToken);
      setUser(result.data.user);
      return null;
    }
    return result.message || 'Signup failed';
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
