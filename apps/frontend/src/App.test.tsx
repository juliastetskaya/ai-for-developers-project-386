import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'

vi.mock('@/lib/api', () => ({
  listMeetingTypes: vi.fn().mockResolvedValue({ data: [], error: null }),
  createMeetingType: vi.fn(),
  listUpcomingBookings: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

function renderAt(route: string) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

test('root route renders the landing page', () => {
  renderAt('/')
  expect(
    screen.getByRole('heading', { name: 'Book a call in a few clicks' }),
  ).toBeInTheDocument()
})

test('layout links to the landing page and the owner dashboard', () => {
  renderAt('/')
  expect(
    screen.getByRole('link', { name: 'Call Calendar' }),
  ).toHaveAttribute('href', '/')
  expect(
    screen.getByRole('link', { name: 'Calendar owner' }),
  ).toHaveAttribute('href', '/admin')
})

test('/book renders the booking page placeholder', () => {
  renderAt('/book')
  expect(
    screen.getByRole('heading', { name: 'Booking' }),
  ).toBeInTheDocument()
})

test('/admin renders the owner dashboard placeholder', () => {
  renderAt('/admin')
  expect(
    screen.getByRole('heading', { name: 'Owner dashboard' }),
  ).toBeInTheDocument()
})
