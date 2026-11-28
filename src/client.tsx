import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CatchBoundary, RouterProvider } from '@tanstack/react-router'
import { StartupError } from './components/startup-error'
import { getRouter } from './router'

// Hand the initial HTML title over to the router when the app starts.
document.head.querySelector('title')?.remove()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CatchBoundary getResetKey={() => 'startup'} errorComponent={StartupError}>
      <RouterProvider router={getRouter()} />
    </CatchBoundary>
  </StrictMode>,
)
