import { render, screen } from '@testing-library/react'
import App from './App'

test('app renders without crashing', () => {
  render(<App />)
  expect(
    screen.getByRole('heading', { name: 'Get started' }),
  ).toBeInTheDocument()
})
