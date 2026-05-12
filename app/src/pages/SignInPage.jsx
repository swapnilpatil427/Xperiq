import { SignIn, SignUp } from '@clerk/react';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useTranslation } from '../lib/i18n';

export function SignInPage({ onNavigate }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('sign-in');

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-surface">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="mesh-grid absolute inset-0 opacity-40" />
        <div
          className="absolute top-[-15%] left-[-10%] w-[40%] h-[40%] rounded-full"
          style={{ background: 'rgba(42,75,217,0.08)', filter: 'blur(120px)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full"
          style={{ background: 'rgba(131,41,200,0.08)', filter: 'blur(150px)' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-12">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg mb-4 bg-gradient-primary"
            style={{ transform: 'rotate(-3deg)' }}
          >
            <Icon name="psychology" fill={1} size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter font-headline text-on-surface">
            {t('brand.name')}
          </h1>
          <p className="text-xs font-bold tracking-widest uppercase mt-1 text-inverse-on-surface">
            {t('brand.tagline')}
          </p>
        </div>

        {/* Clerk component */}
        <div className="flex justify-center">
          {mode === 'sign-in' ? (
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none border-0 bg-transparent',
                  formButtonPrimary: 'bg-primary hover:bg-primary-dim',
                },
              }}
              afterSignInUrl="/"
              redirectUrl="/"
            />
          ) : (
            <SignUp
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none border-0 bg-transparent',
                  formButtonPrimary: 'bg-primary hover:bg-primary-dim',
                },
              }}
              afterSignUpUrl="/"
              redirectUrl="/"
            />
          )}
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
            className="text-sm font-semibold text-primary"
          >
            {mode === 'sign-in' ? t('signIn.switchToSignUp') : t('signIn.switchToSignIn')}
          </button>
        </div>
      </div>
    </div>
  );
}
