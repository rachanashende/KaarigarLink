import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { DEMO_WORKSHOP_CREDENTIALS } from '../../services/demoAuthService'
import { useAuth } from '../../hooks/useAuth'

type LoginLocationState = { from?: unknown; registrationSuccess?: unknown }

export default function LoginPage() {
  const { isAuthenticated, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState(DEMO_WORKSHOP_CREDENTIALS.email)
  const [password, setPassword] = useState(DEMO_WORKSHOP_CREDENTIALS.password)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const requestedPath = (location.state as LoginLocationState | null)?.from
  const registrationSuccess = (location.state as LoginLocationState | null)?.registrationSuccess
  const destination = typeof requestedPath === 'string'
    && requestedPath.startsWith('/')
    && !requestedPath.startsWith('//')
    ? requestedPath
    : '/workshop/dashboard'

  if (isAuthenticated) return <Navigate to={destination} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const result = await signIn(email, password)
      if (!result.ok) {
        setErrorMessage(result.message ?? 'Unable to sign in. Please try again.')
        return
      }
      navigate(destination, { replace: true })
    } catch (error) {
      console.error('The demo login flow failed unexpectedly.', error)
      setErrorMessage('Sign in could not be completed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-label="KaarigarLink workshop sign in">
        <div className="login-brand-panel">
          <div className="login-brand">
            <span className="brand-mark">K</span>
            <span>Kaarigar<span>Link</span></span>
          </div>
          <div className="login-brand-copy">
            <p className="login-kicker">WORKSHOP PORTAL</p>
            <h1>Good work starts with the right connection.</h1>
            <p>Manage manufacturing opportunities, production progress and buyer relationships from one workspace.</p>
          </div>
          <div className="login-brand-footer">
            <span className="brand-orbit" aria-hidden="true"><i /><i /><i /></span>
            <span>Built for the people who make things.</span>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-heading">
            <p className="eyebrow">WELCOME BACK</p>
            <h2>Sign in to your account</h2>
            <p>Use the demo workshop account to explore the portal.</p>
          </div>

          {typeof registrationSuccess === 'string' && (
            <p className="login-success" role="status">{registrationSuccess}</p>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>Email address</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@workshop.com"
                required
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <span className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={8}
                  aria-describedby={errorMessage ? 'login-error' : undefined}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {errorMessage && <p className="login-error" id="login-error" role="alert">{errorMessage}</p>}

            <button type="submit" className="primary-button login-submit" disabled={isSubmitting}>
              {isSubmitting && <span className="login-spinner" aria-hidden="true" />}
              {isSubmitting ? 'Signing in…' : 'Demo Workshop Login'}
            </button>
          </form>

          <div className="demo-credentials">
            <div className="demo-label"><span className="demo-indicator" /> DEMO ACCESS ONLY</div>
            <p>Demo account credentials</p>
            <dl>
              <div><dt>Email</dt><dd>{DEMO_WORKSHOP_CREDENTIALS.email}</dd></div>
              <div><dt>Password</dt><dd>{DEMO_WORKSHOP_CREDENTIALS.password}</dd></div>
            </dl>
          </div>

          <p className="login-disclaimer">This mock sign-in is for demonstration only. It does not use a backend, issue JWTs or provide production authentication.</p>
          <p className="login-register-link">New to KaarigarLink? <Link to="/workshop/onboarding">Register your workshop</Link></p>
        </div>
      </section>
      <footer className="login-footer">© 2026 KaarigarLink <span>·</span> Workshop workspace demo</footer>
    </main>
  )
}
