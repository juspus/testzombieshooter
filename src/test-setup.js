import '@testing-library/jest-dom'

// jsdom doesn't implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

// navigator.maxTouchPoints not set in jsdom
Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, value: 0 })
