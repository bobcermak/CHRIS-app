import { createJSONStorage, type StateStorage } from 'zustand/middleware'

/** localStorage that never throws (private mode, quota, disabled storage). */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // ignore — the app keeps working in memory
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}

export const persistentJSON = () => createJSONStorage(() => safeLocalStorage)
