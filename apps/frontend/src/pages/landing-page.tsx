import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

const steps = [
  {
    title: 'Choose a meeting type',
    description:
      'Pick from the available meeting types — from a quick 15-minute intro to a full hour.',
  },
  {
    title: 'Pick a day and time',
    description:
      'Browse the next two weeks and grab any free slot in the working window.',
  },
  {
    title: 'Leave your details',
    description:
      "Just your name and email — you'll get a confirmation right away.",
  },
]

function LandingPage() {
  return (
    <>
      <section className="flex flex-col items-center gap-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Book a call in a few clicks
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Pick a meeting type, choose a time that suits you, and you're in. No
          sign-up needed.
        </p>
        <Button size="lg" render={<Link to="/book" />}>
          Book a call
        </Button>
      </section>

      <section className="flex flex-col items-center gap-10 py-16">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="grid w-full gap-10 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {index + 1}
              </span>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col items-center gap-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          Ready when you are
        </h2>
        <Button size="lg" render={<Link to="/book" />}>
          Book a call
        </Button>
      </section>
    </>
  )
}

export default LandingPage
