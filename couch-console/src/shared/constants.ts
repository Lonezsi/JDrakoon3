import React from 'react'
import { AppDefinition, MediaItem } from './types'
import { Gamepad2, Video, Tv, Gamepad } from 'lucide-react'

export const BOUNDS = { x: 12, z: 8 }
export const CUBE_SIZE = 1.2
export const COLLISION_RADIUS = 0.75

export const APP_STATES = {
  BOOT: 'BOOT',
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  APP_RUNNING: 'APP_RUNNING',
} as const

export const MOCK_APPS: AppDefinition[] = [
  { id: 'steam', name: 'Steam', icon: React.createElement(Gamepad2), color: 'bg-blue-600', hex: '#2563eb' },
  { id: 'youtube', name: 'YouTube TV', icon: React.createElement(Video), color: 'bg-red-600', hex: '#dc2626' },
  { id: 'plex', name: 'Plex', icon: React.createElement(Tv), color: 'bg-yellow-500', hex: '#eab308' },
  { id: 'retroarch', name: 'RetroArch', icon: React.createElement(Gamepad), color: 'bg-slate-600', hex: '#475569' },
]

export const MOCK_QUEUE: MediaItem[] = [
  { id: 1, title: 'Lofi Hip Hop Radio', duration: 'LIVE', thumb: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=120&q=70' },
  { id: 2, title: 'Nature Documentary', duration: '12:45', thumb: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=120&q=70' },
]
