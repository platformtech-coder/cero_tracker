'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { login } from './actions';
import { Eye, EyeOff } from 'lucide-react';
import styles from './page.module.css';

import { toast } from 'sonner';

const initialState = {
  error: '',
};

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const result = await login(formData);
      if (result?.error) {
        toast.error(result.error);
        return { error: result.error };
      }
      if (result?.success && result.redirectUrl) {
        toast.success('Signed in successfully!');
        router.push(result.redirectUrl);
      }
      return { error: '' };
    },
    initialState
  );

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoWrap}>
            <Image
              src="/logo.png"
              alt="PerbiCubs Logo"
              width={100}
              height={100}
              priority
              className={styles.logo}
            />
          </div>
          <h1 className={styles.title}>CER Dashboard</h1>
          <p className={styles.subtitle}>PerbiCubs Library Services</p>
          <p className={styles.subtitleSmall}>Sign in to your account</p>
        </div>

        <form action={formAction} className={styles.form}>
          {state?.error && <div className={styles.error}>{state.error}</div>}

          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={styles.input}
              placeholder="name@example.com"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                className={styles.input}
                placeholder="••••••••"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isPending} className={styles.button}>
            {isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
