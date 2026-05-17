import { CloudIcon } from 'lucide-react';

import type { Clip } from '@/types';

interface MockFrameProps {
  clip: Clip | undefined;
}

/**
 * Stylized "screen recording" composition keyed off the clip's filename
 * prefix. CSS gradients stand in for real video frames — production swaps
 * this for `<video src={proxy.url}>` once Phase 4 generates proxies.
 *
 * Each branch is hand-tuned to read like the kind of frame the demo clip
 * would actually contain (logo card, browser chrome, outro CTA, …).
 */
export function MockFrame({ clip }: MockFrameProps) {
  if (!clip) {
    return (
      <div className="grid h-full w-full place-items-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
        —
      </div>
    );
  }

  const name = clip.name;

  if (name.startsWith('intro') || name.startsWith('logo')) {
    return <IntroLogoFrame thumb={clip.thumbs?.[0]} />;
  }
  if (name.startsWith('feature_walk') || name.startsWith('demo_result')) {
    return <BrowserChromeFrame thumb={clip.thumbs?.[1] ?? clip.thumbs?.[0]} variant={name.startsWith('demo_result') ? 'result' : 'preview'} />;
  }
  if (name.startsWith('outro') || name.startsWith('graphic')) {
    return <OutroCTAFrame thumb={clip.thumbs?.[0]} />;
  }
  if (name.startsWith('ui_closeup')) {
    return <UICloseupFrame thumb={clip.thumbs?.[0]} />;
  }
  // Default — solid clip gradient.
  return (
    <div
      className="absolute inset-0"
      style={{ background: clip.thumbs?.[0] ?? 'oklch(0.2 0.02 260)' }}
    />
  );
}

/* ─── Per-clip compositions ─────────────────────────────────────────────── */

function IntroLogoFrame({ thumb }: { thumb?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center gap-3.5" style={{ background: thumb }}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <CloudIcon size={28} />
      </div>
      <div style={{ fontFamily: 'Geist', fontSize: 22, fontWeight: 600, color: 'white', letterSpacing: '-0.02em' }}>
        CloudCut
      </div>
      <div className="font-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Q4 product launch
      </div>
    </div>
  );
}

function BrowserChromeFrame({ thumb, variant }: { thumb?: string; variant: 'preview' | 'result' }) {
  return (
    <div className="absolute inset-0" style={{ padding: '5%', background: thumb ?? 'oklch(0.2 0.02 260)' }}>
      <div
        className="h-full overflow-hidden rounded-md grid"
        style={{
          gridTemplateRows: '22px 1fr',
          background: 'oklch(0.16 0.01 260)',
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.6)',
        }}
      >
        {/* Window chrome */}
        <div
          className="flex items-center gap-1.5 px-2.5"
          style={{ background: 'oklch(0.22 0.01 260)', borderBottom: '1px solid oklch(0.28 0.01 260)' }}
        >
          <div className="h-[7px] w-[7px] rounded-full" style={{ background: 'oklch(0.65 0.16 25)' }} />
          <div className="h-[7px] w-[7px] rounded-full" style={{ background: 'oklch(0.78 0.15 75)' }} />
          <div className="h-[7px] w-[7px] rounded-full" style={{ background: 'oklch(0.65 0.15 145)' }} />
          <div
            className="font-mono mx-4 flex flex-1 items-center rounded-sm px-1.5"
            style={{ height: 12, background: 'oklch(0.18 0.01 260)', fontSize: 8, color: 'rgba(255,255,255,0.4)' }}
          >
            cloudcut.io/edit/q4-launch
          </div>
        </div>
        {/* Body: sidebar + main */}
        <div className="grid gap-1.5 p-1.5" style={{ gridTemplateColumns: '32% 1fr' }}>
          <div className="rounded-sm p-2" style={{ background: 'oklch(0.2 0.01 260)' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="mb-1.5 rounded-[2px]"
                style={{
                  height: 8,
                  background: i === 1 ? 'var(--accent)' : 'oklch(0.28 0.01 260)',
                  width: `${60 + (i % 3) * 15}%`,
                  opacity: i === 1 ? 1 : 0.7,
                }}
              />
            ))}
          </div>
          <div className="relative overflow-hidden rounded-sm" style={{ background: 'oklch(0.22 0.01 260)' }}>
            <div
              className="absolute rounded-sm"
              style={{
                inset: '20%',
                background: 'linear-gradient(120deg, var(--accent), oklch(0.6 0.13 230))',
                opacity: 0.7,
              }}
            />
            <div
              className="font-mono absolute inset-0 grid place-items-center"
              style={{ color: 'white', fontSize: 10 }}
            >
              {variant === 'result' ? '✓ exported' : 'preview'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutroCTAFrame({ thumb }: { thumb?: string }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center text-center"
      style={{ background: thumb ?? 'oklch(0.3 0.06 280)' }}
    >
      <div>
        <div
          style={{
            fontFamily: 'Geist',
            fontSize: 20,
            fontWeight: 600,
            color: 'white',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}
        >
          Start editing in your browser
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}
        >
          cloudcut.io
        </div>
      </div>
    </div>
  );
}

function UICloseupFrame({ thumb }: { thumb?: string }) {
  const labels = ['EXTRACT', 'RENDER', 'UPLOAD'] as const;
  return (
    <div className="absolute inset-0" style={{ padding: '8%', background: thumb }}>
      <div className="grid h-full gap-1" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {labels.map((label, i) => (
          <div
            key={label}
            className="grid place-content-center rounded-sm p-2"
            style={{ background: 'oklch(0.22 0.02 240)' }}
          >
            <div
              className="mx-auto rounded-sm"
              style={{
                width: 18,
                height: 18,
                background: i === 1 ? 'var(--accent)' : 'oklch(0.35 0.05 240)',
              }}
            />
            <div
              className="font-mono mt-1 text-center"
              style={{ fontSize: 6, color: 'rgba(255,255,255,0.5)' }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
