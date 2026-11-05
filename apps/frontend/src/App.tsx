import { Route, Routes } from 'react-router'
import Layout from '@/components/layout'
import BookingPage from '@/pages/booking-page'
import LandingPage from '@/pages/landing-page'
import OwnerDashboardPage from '@/pages/owner-dashboard-page'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="book" element={<BookingPage />} />
        <Route path="admin" element={<OwnerDashboardPage />} />
      </Route>
    </Routes>
  )
}

export default App
