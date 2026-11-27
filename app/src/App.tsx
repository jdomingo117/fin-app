import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom'
import { ViewContext, VIEW_PATHS, pathToView, navNumber, useView, type Appearance, type View } from './router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { BudgetProvider } from './contexts/BudgetContext'
import { RequireAnon, RequireAuth, RequireOnboarded } from './components/Guards'
import ViewDataBoundary, { ViewLoadingState } from './components/ViewDataBoundary'
import SceneBackground from './three/SceneBackground'
import ConsoleViewport from './components/console/ConsoleViewport'
import { noticeState } from './lib/consoleNotices'
import { readConsoleStartSeen, writeConsoleStartSeen } from './components/console/ConsoleStartScreen'
import { useAppearanceDocument, useAppearancePreferences } from './components/console/appearance'
import { supabase } from './lib/supabaseClient'
import Shell from './components/Shell'
import ThemeToggle from './components/ThemeToggle'
import Boot from './components/Boot'
import MilestoneToast, { type ToastData, type ToastInput } from './components/MilestoneToast'
import ProviderSyncNotice from './components/ProviderSyncNotice'
import Login from './views/Login'
import AuthCallback from './views/AuthCallback'
import ResetPassword from './views/ResetPassword'
import Onboarding from './views/Onboarding'
import Landing from './views/Landing'
import Dashboard from './views/Dashboard'

const Accounts = lazy(() => import('./views/Accounts'))
const Income = lazy(() => import('./views/Income'))
const Expenses = lazy(() => import('./views/Expenses'))
const Budget = lazy(() => import('./views/Budget'))
const GoalsHub = lazy(() => import('./views/GoalsHub'))
const BillsHub = lazy(() => import('./views/BillsHub'))
const LedgerView = lazy(() => import('./views/LedgerView'))
const Ingestion = lazy(() => import('./views/Ingestion'))
const TransferReview = lazy(() => import('./views/TransferReview'))
const Settings = lazy(() => import('./views/Settings'))
const OperationStatusConcept = lazy(() => import('./views/OperationStatusConcept'))

function DataRoute({ index, title, sub, children }: { index: string; title: string; sub?: string; children: ReactNode }) {
  return <ViewDataBoundary index={index} title={title} sub={sub}>{children}</ViewDataBoundary>
}

function LazyDataRoute({ index, title, sub, children }: { index: string; title: string; sub?: string; children: ReactNode }) {
  return <DataRoute index={index} title={title} sub={sub}><Suspense fallback={<ViewLoadingState index={index} title={title} sub={sub} />}>{children}</Suspense></DataRoute>
}

/** Chrome shared by the signed-in views. */
function ShellLayout({ startEntrySeen }: { startEntrySeen: { current: boolean } }) {
  const { theme } = useView()
  if (theme === 'console') return <ConsoleViewport startEntrySeen={startEntrySeen} />
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

/** Bare-canvas layout for auth screens, which render without the nav shell. */
function BareLayout() {
  return <Outlet />
}

/**
 * Bridges the router to the pre-existing `useView()` API so Shell, Landing
 * and Onboarding keep calling `go('dashboard')` without modification.
 */
type QuietAlerts = { on: boolean; set: (on: boolean) => void }

function ViewBridge({
  children, theme, setTheme, dark, setDark, motionOn, setMotionOn, fireToast, quiet,
}: {
  children: React.ReactNode
  theme: Appearance; setTheme: (theme: Appearance) => void
  dark: boolean; setDark: (on: boolean) => void
  motionOn: boolean; setMotionOn: (on: boolean) => void
  fireToast: (a: ToastInput) => void
  quiet: QuietAlerts
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const go = useCallback((v: View, options?: { state?: unknown }) => navigate(VIEW_PATHS[v], options), [navigate])
  const view = pathToView(location.pathname)

  return (
    <ViewContext.Provider
      value={{ view, go, toast: fireToast, quietAlerts: quiet.on, setQuietAlerts: quiet.set, motionOn, setMotionOn, theme, setTheme, dark, setDark }}
    >
      {children}
    </ViewContext.Provider>
  )
}

function AppFrame({
  booted, setBooted, theme, setTheme, dark, setDark, motionOn, setMotionOn, toast, fireToast, quiet,
}: {
  booted: boolean; setBooted: (b: boolean) => void
  theme: Appearance; setTheme: (theme: Appearance) => void
  dark: boolean; setDark: (on: boolean) => void
  motionOn: boolean; setMotionOn: (on: boolean) => void
  toast: ToastData | null
  fireToast: (a: ToastInput) => void
  quiet: QuietAlerts
}) {
  const location = useLocation()
  const view = pathToView(location.pathname)
  const { session, recoveryError, retryAccountRecovery } = useAuth()
  const [startEntrySeen] = useState(() => ({ current: readConsoleStartSeen() }))
  useLayoutEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return
      quiet.set(false)
      startEntrySeen.current = false
      writeConsoleStartSeen(false)
    })
    return () => subscription.unsubscribe()
  }, [startEntrySeen, quiet.set])
  const consoleEntry = theme === 'console'
    && view !== 'login' && view !== 'onboarding' && view !== 'operation-status'
    && !location.pathname.startsWith('/auth/')
  const consoleViewport = consoleEntry && !!session && !recoveryError
  const effectiveDark = consoleViewport || dark
  // A signed-in Console reload can enter routing while the session resolves.
  // The protected routes still wait to show their content inside RequireAuth.
  const ready = booted || consoleEntry
  useLayoutEffect(() => {
    if (consoleViewport && !booted) setBooted(true)
  }, [consoleViewport, booted, setBooted])

  useAppearanceDocument(consoleViewport ? 'console' : 'classic', effectiveDark)

  return (
    <ViewBridge
      theme={consoleViewport ? 'console' : 'classic'} setTheme={setTheme}
      dark={effectiveDark} setDark={setDark}
      motionOn={motionOn} setMotionOn={setMotionOn}
      fireToast={fireToast}
      quiet={quiet}
    >
      {!consoleViewport && <SceneBackground view={view} motionOn={motionOn} dark={dark} />}

      <AnimatePresence>
        {!ready && <Boot key="boot" onDone={() => setBooted(true)} />}
      </AnimatePresence>

      {ready && recoveryError ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-[15px] font-medium">Account recovery needs attention</p>
            <p className="mt-2 text-[13px] text-muted">{recoveryError}</p>
            <button type="button" className="mt-4 rounded-md border border-[var(--hair)] px-3 py-2 text-[13px] hover:border-accent" onClick={() => void retryAccountRecovery()}>
              Retry recovery
            </button>
          </div>
        </div>
      ) : ready && (
        <Routes location={location} key={consoleViewport ? 'console-viewport' : location.pathname}>
          {/* Pre-auth */}
          <Route element={<BareLayout />}>
            <Route path="/login" element={<RequireAnon><Login /></RequireAnon>} />
            {/* The callback routes are deliberately NOT behind RequireAnon:
                they run while a session is being established, and bouncing
                them would break the exchange they exist to perform. */}
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
          </Route>

          {/* Signed in */}
          <Route
            element={
              <RequireAuth>
                <RequireOnboarded>
                  <ShellLayout startEntrySeen={startEntrySeen} />
                </RequireOnboarded>
              </RequireAuth>
            }
          >
            <Route path="/" element={consoleViewport ? <Navigate to="/dashboard" replace /> : <Landing />} />
            <Route path="/dashboard" element={<DataRoute index="01 — Command" title="Dashboard" sub="Your finances at a glance"><Dashboard /></DataRoute>} />
            <Route path="/accounts" element={<LazyDataRoute index="02 — Accounts" title="Accounts" sub="Balances, activity & connections"><Accounts /></LazyDataRoute>} />
            <Route path="/income" element={<LazyDataRoute index="03 — Income" title="Income" sub="Inflow analysis & patterns"><Income /></LazyDataRoute>} />
            <Route path="/expenses" element={<LazyDataRoute index="04 — Expenses" title="Expenses" sub="Outflow analysis, category changes & recurring costs"><Expenses /></LazyDataRoute>} />
            <Route path="/budget" element={<Suspense fallback={<ViewLoadingState index="05 — Budget" title="Budget" />}><Budget /></Suspense>} />
            <Route path="/goals" element={consoleViewport
              ? <LazyDataRoute index="Plan — Goals" title="Goals" sub="Targets you’re working toward"><GoalsHub /></LazyDataRoute>
              : <Navigate to="/income" replace state={noticeState('projections')} />} />
            <Route path="/bills" element={consoleViewport
              ? <LazyDataRoute index="Plan — Bills" title="Bills" sub="Recurring costs coming up"><BillsHub /></LazyDataRoute>
              : <Navigate to="/expenses" replace state={noticeState('recurring')} />} />
            <Route path="/ledger" element={<LazyDataRoute index={`${navNumber('ledger')} — Ledger`} title="Ledger" sub="Inspect, review and correct every transaction"><LedgerView /></LazyDataRoute>} />
            <Route path="/ingestion" element={<LazyDataRoute index={`${navNumber('ingestion')} — Ingestion`} title="Ingestion" sub="Import statements, categorise, reconcile balances"><Ingestion /></LazyDataRoute>} />
            <Route path="/transfers" element={<LazyDataRoute index={`${navNumber('transfers')} — Reconciliation`} title="Transfer review" sub="Resolve movements between accounts"><TransferReview /></LazyDataRoute>} />
            <Route path="/settings" element={<LazyDataRoute index="⚙ — Configuration" title="Settings" sub="Interface, identity & preferences"><Settings /></LazyDataRoute>} />
            <Route path="/concept/operation-status" element={<LazyDataRoute index="LAB — Feedback" title="Operation status patterns" sub="Concept review — not connected to live operations"><OperationStatusConcept /></LazyDataRoute>} />
          </Route>

          {/* Unknown URL: home for a signed-in user, login otherwise. */}
          <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
        </Routes>
      )}

      {ready && view!=='budget' && !consoleViewport && (
        <ThemeToggle onConsole={view === 'dashboard' && session ? () => setTheme('console') : undefined} />
      )}
      {ready && session && <ProviderSyncNotice />}
      <MilestoneToast toast={toast} />
    </ViewBridge>
  )
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [motionOn, setMotionOn] = useState(true)
  const { theme, setTheme, dark, setDark } = useAppearancePreferences()
  const [toast, setToast] = useState<ToastData | null>(null)
  const toastId = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const [quietAlerts, setQuietState] = useState(false)
  const quietRef = useRef({ on: false, console: false })
  quietRef.current = { on: quietAlerts, console: theme === 'console' }
  const setQuietAlerts = useCallback((on: boolean) => {
    setQuietState(on)
    quietRef.current.on = on
    if (on) {
      window.clearTimeout(timer.current)
      setToast(null)
    }
  }, [])
  const quiet = useMemo(() => ({ on: quietAlerts, set: setQuietAlerts }), [quietAlerts, setQuietAlerts])

  const fireToast = useCallback((a: ToastInput) => {
    // Quiet alerts only applies while Console is the appearance, and never hides a failure.
    if (quietRef.current.on && quietRef.current.console && a.tone !== 'error') return
    toastId.current += 1
    setToast({ id: toastId.current, ...a })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 3800)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <BudgetProvider>
            <AppFrame
              booted={booted} setBooted={setBooted}
              theme={theme} setTheme={setTheme}
              dark={dark} setDark={setDark}
              motionOn={motionOn} setMotionOn={setMotionOn}
              toast={toast} fireToast={fireToast} quiet={quiet}
            />
          </BudgetProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
