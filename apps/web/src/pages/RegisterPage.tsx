import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContainer';
import type { FormErrors } from '../types';

export function RegisterPage() {
  const { register, isLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      navigate('/');
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-lg shadow-md border border-border p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-light text-primary mb-4">
              <span className="text-3xl">🤟</span>
            </div>
            <h1 className="text-2xl font-bold text-text">Crear Cuenta</h1>
            <p className="text-text-muted mt-2">Únete a MITTEN V2 y gestiona tus gestos</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.form && (
              <div className="p-3 rounded-md bg-error-light border border-error text-error text-sm">
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                  errors.email ? 'border-error' : 'border-border'
                }`}
                placeholder="usuario@ejemplo.com"
                disabled={isSubmitting}
                autoComplete="email"
              />
              {errors.email && <p className="mt-1 text-sm text-error">{errors.email}</p>}
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                  errors.password ? 'border-error' : 'border-border'
                }`}
                placeholder="Mínimo 8 caracteres"
                disabled={isSubmitting}
                autoComplete="new-password"
              />
              {errors.password && <p className="mt-1 text-sm text-error">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1">
                Confirmar Contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                  errors.confirmPassword ? 'border-error' : 'border-border'
                }`}
                placeholder="Repite la contraseña"
                disabled={isSubmitting}
                autoComplete="new-password"
              />
              {errors.confirmPassword && <p className="mt-1 text-sm text-error">{errors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full py-2.5 px-4 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creando cuenta...' : 'Crear Cuenta'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-muted">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-text-muted">
          <p>MITTEN V2 — Guante electrónico para traducción de gestos</p>
        </div>
      </div>
    </div>
  );
}