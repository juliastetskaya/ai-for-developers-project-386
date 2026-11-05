import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import LandingPage from './landing-page'

test('landing page renders hero with a call-to-action leading to the booking page', () => {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )

  expect(
    screen.getByRole('heading', { name: 'Book a call in a few clicks' }),
  ).toBeInTheDocument()

  const ctaLinks = screen.getAllByRole('link', { name: 'Book a call' })
  expect(ctaLinks.length).toBeGreaterThan(0)
  for (const link of ctaLinks) {
    expect(link).toHaveAttribute('href', '/book')
  }
})

test('landing page explains how the service works in three steps', () => {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )

  expect(
    screen.getByRole('heading', { name: 'How it works' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Choose a meeting type' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Pick a day and time' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Leave your details' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Ready when you are' }),
  ).toBeInTheDocument()
})
