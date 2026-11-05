import { Link, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'

function Layout() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between border-b py-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Call Calendar
        </Link>
        <Button render={<Link to="/book" />}>Book a call</Button>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="flex items-center justify-between border-t py-6 text-sm text-muted-foreground">
        <span>© 2026 Call Calendar</span>
        <Link to="/admin" className="hover:text-foreground hover:underline">
          Calendar owner
        </Link>
      </footer>
    </div>
  )
}

export default Layout
