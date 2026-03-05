'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '@/public/Frame-1-Playful.json';

interface LoadingScreenProps {
  onComplete: () => void;
}

const FONT = "var(--font-heading, 'Sora', 'Source Sans Pro', system-ui, sans-serif)";

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [showTech, setShowTech] = useState(false);
  const [showBirmingham, setShowBirmingham] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [orangeGlow, setOrangeGlow] = useState(false);

  useEffect(() => {
    // "Tech" slides in as rings bounce in
    const techTimer = setTimeout(() => setShowTech(true), 800);
    // "Birmingham" follows after a beat
    const birmTimer = setTimeout(() => setShowBirmingham(true), 1300);
    // Orange glow fires when animation turns orange (~1590ms)
    const glowTimer = setTimeout(() => setOrangeGlow(true), 1600);
    // Hold so the user can enjoy it, then fade
    const fadeTimer = setTimeout(() => setFadeOut(true), 3200);
    // Unmount after fade transition (0.6s)
    const doneTimer = setTimeout(() => onComplete(), 3800);

    return () => {
      clearTimeout(techTimer);
      clearTimeout(birmTimer);
      clearTimeout(glowTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? 'none' : 'auto',
        transition: 'opacity 0.6s ease-out',
      }}
    >
      {/* Lottie — transparent background via rendererSettings */}
      <div style={{
        filter: orangeGlow ? 'drop-shadow(0 0 18px rgba(242,101,34,0.75)) drop-shadow(0 0 40px rgba(242,101,34,0.40))' : 'none',
        transition: 'filter 0.4s ease-out',
      }}>
      <Lottie
        animationData={animationData}
        loop={false}
        autoplay={true}
        style={{ width: 240, height: 240 }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
      </div>

      {/* Text block sits tight beneath the animation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        {/* "Tech" */}
        <span
          style={{
            fontFamily: FONT,
            fontSize: '3rem',
            fontWeight: 700,
            color: '#132c4f',
            letterSpacing: '0.06em',
            opacity: showTech ? 1 : 0,
            transform: showTech ? 'translateY(0)' : 'translateY(14px)',
            transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
          }}
        >
          Tech
        </span>

        {/* "Birmingham" */}
        <span
          style={{
            fontFamily: FONT,
            fontSize: '1.35rem',
            fontWeight: 400,
            color: '#6caddf',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            opacity: showBirmingham ? 1 : 0,
            transform: showBirmingham ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
          }}
        >
          Birmingham
        </span>
      </div>
    </div>
  );
}
