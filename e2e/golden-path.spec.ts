import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100'

const MONTHS: Record<string, string> = {
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  May: 'May',
  Jun: 'June',
  Jul: 'July',
  Aug: 'August',
  Sep: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
}

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

test('guest books a free slot and sees the confirmation', async ({
  page,
  request,
}) => {
  // Arrange: a fresh meeting type through the real API. The backend runs
  // against a per-run SQLite file, so no other data affects the flow.
  const meetingTypeName = `Golden path ${randomUUID().slice(0, 8)}`
  const createResponse = await request.post(`${API_URL}/meeting-types`, {
    data: {
      name: meetingTypeName,
      description: 'Golden path meeting type',
      durationMin: 30,
    },
  })
  expect(createResponse.status()).toBe(201)

  // Landing -> Booking page.
  await page.goto('/')
  await page.getByRole('link', { name: 'Book a call' }).first().click()
  await expect(page).toHaveURL(/\/book$/)

  // Meeting type: the whole card is the button.
  await page.getByRole('button', { name: meetingTypeName }).click()

  // Day: the second entry is tomorrow in Europe/Moscow, so it is always in
  // the future and inside the 14-day booking horizon.
  const days = page
    .getByRole('list', { name: 'Available days' })
    .getByRole('button')
  const dayButton = days.nth(1)
  const dayLabel = ((await dayButton.getAttribute('aria-label')) ?? '')
    .replace(/, today$/, '')
    .trim()
  const parsedDay = /^[A-Za-z]{3} (\d{1,2}) ([A-Za-z]{3})$/.exec(dayLabel)
  expect(parsedDay, `unexpected day label: ${dayLabel}`).not.toBeNull()
  const [, dayNumber, monthShort] = parsedDay!
  const monthLong = MONTHS[monthShort]
  expect(monthLong, `unexpected month: ${monthShort}`).toBeDefined()
  await dayButton.click()

  // Slot: take the first rendered free slot and remember its start time.
  const slotButton = page
    .getByRole('list', { name: 'Available slots' })
    .getByRole('button')
    .first()
  await expect(slotButton).toBeVisible()
  const slotStart = (await slotButton.innerText()).trim()
  expect(slotStart).toMatch(/^\d{2}:\d{2}$/)
  const slotEnd = addMinutes(slotStart, 30)
  await slotButton.click()

  // Guest form.
  const guestName = 'Ada Lovelace'
  const guestEmail = 'ada.lovelace@example.com'
  const guestComment = 'Looking forward to our call.'
  await page.getByLabel('Name', { exact: true }).fill(guestName)
  await page.getByLabel('Email', { exact: true }).fill(guestEmail)
  await page.getByLabel('Comment (optional)', { exact: true }).fill(guestComment)

  // Submit and confirm.
  await page.getByRole('button', { name: 'Confirm booking' }).click()

  await expect(
    page.getByRole('heading', { name: 'Booking confirmed' }),
  ).toBeVisible()

  const confirmation = page.locator('article')
  await expect(
    confirmation.getByRole('heading', { name: meetingTypeName }),
  ).toBeVisible()
  await expect(confirmation).toContainText(`${dayNumber} ${monthLong}`)
  await expect(confirmation).toContainText(
    `${slotStart}–${slotEnd} · Europe/Moscow`,
  )
  await expect(confirmation).toContainText(guestName)
  await expect(confirmation).toContainText(guestEmail)
  await expect(confirmation).toContainText(guestComment)
})
