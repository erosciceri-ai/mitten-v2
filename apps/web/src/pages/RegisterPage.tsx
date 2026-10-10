import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContainer';
import type { FormErrors } from '../types';
import { BrandMark } from '../components/BrandMark';
import { GoogleSignInButton, isGoogleSignInConfigured } from '../components/GoogleSignInButton';
import { Button } from '../components/ui/button';

export function RegisterPage() {
  const { register, loginWithGoogle, isLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      showToast({ type: 'success', message: 'Cuenta creada correctamente' });
      navigate('/app');
    } finally {
      setIsSubmitting(false);
    }
  }, [loginWithGoogle, navigate, showToast]);

  const validate = () => {
    const newErrors: FormErrors = {};
    if (!email) newErrors.email = 'Email es requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Email inválido';
    if (!password) newErrors.password = 'Contraseña es requerida';
    else if (password.length < 8) newErrors.password = 'La contraseña debe tener al menos 8 caracteres';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await register({ email, password });
      showToast({ type: 'success', message: 'Cuenta creada correctamente' });
      navigate('/app');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al registrar';
      if (message.includes('already exists')) {
        setErrors({ email: 'Este email ya está registrado' });
      } else if (message.includes('Validation')) {
        setErrors({ form: message });
      } else {
        showToast({ type: 'error', message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="auth-panel bg-surface rounded-xl border border-border p-7 sm:p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5"><BrandMark /></div>
            <h1 className="text-2xl font-bold text-text">Crear cuenta</h1>
            <p className="text-text-muted mt-2">Sumate a MITTEN V2.1 y administrá tus gestos</p>
          </div>

          {isGoogleSignInConfigured && (
            <>
              <GoogleSignInButton
                onCredential={handleGoogleCredential}
                onError={message => showToast({ type: 'error', message })}
                text="signup_with"
              />
              <div className="auth-divider"><span>o registrate con correo</span></div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.form && (
              <div className="p-3 rounded-md bg-error-light border border-error text-error text-sm" role="alert">
                {errors.form}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="app-field"
                placeholder="usuario@ejemplo.com"
                disabled={isSubmitting}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'register-email-error' : undefined}
              />
              {errors.email && <p id="register-email-error" className="mt-1 text-sm text-error" role="alert">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="app-field"
                placeholder="Mínimo 8 caracteres"
                disabled={isSubmitting}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'register-password-error' : 'register-password-help'}
              />
              {errors.password ? (
                <p id="register-password-error" className="mt-1 text-sm text-error" role="alert">{errors.password}</p>
              ) : (
                <p id="register-password-help" className="mt-1 text-sm text-text-muted">Usá al menos 8 caracteres.</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1">
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="app-field"
                placeholder="Repetí la contraseña"
                disabled={isSubmitting}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'register-confirm-error' : undefined}
              />
              {errors.confirmPassword && <p id="register-confirm-error" className="mt-1 text-sm text-error" role="alert">{errors.confirmPassword}</p>}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-muted">
              ¿Ya tenés cuenta?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Iniciá sesión
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-text-muted">
          <Link to="/" className="hover:underline">Conocer el proyecto</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacidad" className="hover:underline">Privacidad</Link>
        </div>
      </div>
    </div>
  );
}
