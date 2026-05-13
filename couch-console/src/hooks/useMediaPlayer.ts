import { useState, useRef, useCallback, useEffect } from 'react'

export interface QueueItem {
  id: number
  title: string
  channel: string
  duration: string
  thumb: string
  url?: string
  addedBy: string
}

const INITIAL_QUEUE: QueueItem[] = [
  {
    id: 1,
    title: 'Lofi Hip Hop Radio',
    channel: 'ChilledCow',
    duration: 'LIVE',
    thumb: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=120&q=70',
    addedBy: 'System'
  },
  {
    id: 2,
    title: 'Planet Earth II – Forests',
    channel: 'BBC Earth',
    duration: '12:45',
    thumb: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=120&q=70',
    addedBy: 'System'
  },
  {
    id: 3,
    title: 'Synthwave Mix 2024',
    channel: 'NightDrive',
    duration: '1:02:33',
    thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=120&q=70',
    addedBy: 'System'
  },
]

export function useMediaPlayer() {
  const [queue, setQueue] = useState<QueueItem[]>(INITIAL_QUEUE)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)       // 0–100
  const [volume, setVolume] = useState(72)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const currentItem = queue[currentIndex] ?? null
  const intervalRef = useRef<number | null>(null)

  // Simulate progress when playing
  useEffect(() => {
    if (isPlaying && currentItem && currentItem.duration !== 'LIVE') {
      intervalRef.current = window.setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            // Auto next
            handleNext()
            return 0
          }
          return prev + (0.1 * 100) / 12  // approx 12.5 seconds to finish
        })
      }, 100)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, currentItem])

  const handlePlayPause = useCallback(() => setIsPlaying(p => !p), [])
  const handleNext = useCallback(() => {
    setCurrentIndex(i => (i + 1) % queue.length)
    setProgress(0)
    setIsPlaying(true)
  }, [queue.length])
  const handlePrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + queue.length) % queue.length)
    setProgress(0)
    setIsPlaying(true)
  }, [queue.length])
  const handleSeek = useCallback((value: number) => setProgress(value), [])
  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value)
    setMuted(false)
  }, [])
  const toggleMute = useCallback(() => setMuted(m => !m), [])
  const toggleFullscreen = useCallback(() => setIsFullscreen(f => !f), [])

  // Queue management
  const addToQueue = useCallback((url: string, addedBy: string = 'You') => {
    const title = url.length > 40 ? url.slice(0, 40) + '…' : url
    const newItem: QueueItem = {
      id: Date.now(),
      title,
      channel: 'Added manually',
      duration: '--:--',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=120&q=70',
      url,
      addedBy,
    }
    setQueue(q => [...q, newItem])
  }, [])
  const removeFromQueue = useCallback((index: number) => {
    setQueue(q => q.filter((_, i) => i !== index))
    if (index === currentIndex && queue.length > 1) {
      setCurrentIndex(Math.min(currentIndex, queue.length - 2))
      setProgress(0)
    }
  }, [currentIndex, queue.length])
  const moveUp = useCallback((index: number) => {
    if (index === 0) return
    setQueue(q => {
      const arr = [...q];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
      return arr
    })
  }, [])
  const moveDown = useCallback((index: number) => {
    if (index === queue.length - 1) return
    setQueue(q => {
      const arr = [...q];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
      return arr
    })
  }, [queue.length])
  const clearQueue = useCallback(() => {
    setQueue([])
    setCurrentIndex(0)
    setProgress(0)
    setIsPlaying(false)
  }, [])

  return {
    currentItem,
    isPlaying,
    progress,
    volume,
    muted,
    isFullscreen,
    queue,
    handlePlayPause,
    handleNext,
    handlePrev,
    handleSeek,
    handleVolumeChange,
    toggleMute,
    toggleFullscreen,
    addToQueue,
    removeFromQueue,
    moveUp,
    moveDown,
    clearQueue,
    currentIndex,
  }
}