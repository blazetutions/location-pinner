import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import GeocodingProgress from './GeocodingProgress'
import * as geocodingEngine from '../lib/geocodingEngine'

// Mock the geocodingEngine module
vi.mock('../lib/geocodingEngine', () => ({
  runGeocodingPass: vi.fn(),
}))

describe('GeocodingProgress', () => {
  let onGeocodingCompleteMock

  beforeEach(() => {
    onGeocodingCompleteMock = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when no rows need geocoding', async () => {
    // Mock runGeocodingPass to simulate zero rows processed
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      // No progress calls — zero rows
      return { geocoded: 0, fallback: 0, failed: 0 }
    })

    const { container } = render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })

    // Component should render nothing (return null)
    expect(container.firstChild).toBeNull()
  })

  it('displays progress bar and estimated time while geocoding', async () => {
    // Mock runGeocodingPass to simulate a slow geocoding pass
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      onProgress(0, 120) // 120 rows total
      await new Promise((resolve) => setTimeout(resolve, 50))
      onProgress(30, 120)
      await new Promise((resolve) => setTimeout(resolve, 50))
      onProgress(60, 120)
      await new Promise((resolve) => setTimeout(resolve, 50))
      onProgress(120, 120)
      return { geocoded: 100, fallback: 15, failed: 5 }
    })

    render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    // Check initial progress state
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toBeInTheDocument()
    })

    // Check that estimated time is displayed (120 rows / 60 = 2 minutes)
    expect(screen.getByText(/~2 minutes remaining/i)).toBeInTheDocument()

    // Wait for completion
    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })
  })

  it('displays completion summary with correct counts', async () => {
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      onProgress(0, 50)
      onProgress(25, 50)
      onProgress(50, 50)
      return { geocoded: 35, fallback: 10, failed: 5 }
    })

    render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    // Wait for completion summary
    await waitFor(() => {
      expect(
        screen.getByText(/Done: 35 geocoded, 10 fallback, 5 failed/i)
      ).toBeInTheDocument()
    })

    expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
  })

  it('calls onGeocodingComplete when geocoding finishes', async () => {
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      onProgress(0, 10)
      onProgress(10, 10)
      return { geocoded: 8, fallback: 1, failed: 1 }
    })

    render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })
  })

  it('restarts geocoding when locationRows prop changes', async () => {
    let callCount = 0
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      callCount++
      onProgress(0, 5)
      onProgress(5, 5)
      return { geocoded: 5, fallback: 0, failed: 0 }
    })

    const { rerender } = render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test1' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })

    // Change locationRows
    rerender(
      <GeocodingProgress
        locationRows={[{ id: 2, query_text: 'test2' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(2)
    })

    expect(callCount).toBe(2)
  })

  it('displays singular "minute" when estimated time is 1 minute', async () => {
    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      onProgress(0, 60) // 60 rows = 1 minute remaining
      await new Promise((resolve) => setTimeout(resolve, 50))
      onProgress(30, 60) // 30 rows = 1 minute remaining (rounded up from 0.5)
      await new Promise((resolve) => setTimeout(resolve, 50))
      onProgress(60, 60)
      return { geocoded: 60, fallback: 0, failed: 0 }
    })

    render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    await waitFor(() => {
      // Should show "1 minute" (singular)
      expect(screen.getByText(/~1 minute remaining/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })
  })

  it('has accessible aria labels and live regions', async () => {
    // Use a promise to control when geocoding finishes so we can assert on
    // in-progress state before resolution
    let resolveGeocoding
    const geocodingDone = new Promise((res) => { resolveGeocoding = res })

    geocodingEngine.runGeocodingPass.mockImplementation(async (onProgress) => {
      onProgress(0, 10)
      onProgress(5, 10)
      await geocodingDone
      onProgress(10, 10)
      return { geocoded: 10, fallback: 0, failed: 0 }
    })

    render(
      <GeocodingProgress
        locationRows={[{ id: 1, query_text: 'test' }]}
        onGeocodingComplete={onGeocodingCompleteMock}
      />
    )

    // Check for progress bar with aria-label while in-progress
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-label')
    })

    // Check for aria-live region on the progress text
    const liveRegion = screen.getByText(/Geocoding: 5 of 10 rows processed/i)
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')

    // Let geocoding finish
    resolveGeocoding()

    await waitFor(() => {
      expect(onGeocodingCompleteMock).toHaveBeenCalledTimes(1)
    })

    // After completion, summary should have role="status"
    const summary = screen.getByRole('status')
    expect(summary).toHaveAttribute('aria-live', 'polite')
  })
})
