import { Component, createUniqueId } from "solid-js";
import { activeTonalPalette, appTheme } from "../store";

interface DynamicAppLogoProps {
  size?: number;
  class?: string;
  animate?: boolean;
}

export const DynamicAppLogo: Component<DynamicAppLogoProps> = (props) => {
  const pal = activeTonalPalette;
  const theme = appTheme;
  const size = () => props.size || 32;
  const animate = () => props.animate !== false;

  // Stable unique ID for SVG filter/gradient references
  const uniqueId = `dyn-logo-${createUniqueId()}`;

  const isLight = () => theme() === "light";

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      class={`app-logo ${props.class || ""}`}
      style={{
        "min-width": `${size()}px`,
        width: `${size()}px`,
        height: `${size()}px`,
        "flex-shrink": "0",
      }}
    >
      <defs>
        {/* Dynamic Stage Canvas Background (adapts cleanly to Dark/Light mode) */}
        <linearGradient id={`${uniqueId}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            stop-color={
              isLight()
                ? "#ffffff"
                : "#160f14"
            }
          />
          <stop
            offset="50%"
            stop-color={
              isLight()
                ? "#f7f1f3"
                : "#0e0a0d"
            }
          />
          <stop
            offset="100%"
            stop-color={
              isLight()
                ? "#eee2e6"
                : "#070507"
            }
          />
        </linearGradient>

        {/* Dynamic Glowing Laser String Gradient */}
        <linearGradient id={`${uniqueId}-laser`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color={pal().logoWave || "#ffe3e0"} />
          <stop offset="25%" stop-color={pal().primaryLight || "#f7a399"} />
          <stop offset="65%" stop-color={pal().primary || "#f38375"} />
          <stop offset="100%" stop-color={pal().primaryDark || "#ef6351"} />
        </linearGradient>

        {/* Dynamic Harmonic Wave Echo Gradient */}
        <linearGradient id={`${uniqueId}-echo`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color={pal().primaryLight || "#ffe3e0"} stop-opacity="0.8" />
          <stop offset="50%" stop-color={pal().primary || "#f7a399"} stop-opacity="0.4" />
          <stop offset="100%" stop-color={pal().primaryDark || "#ef6351"} stop-opacity="0" />
        </linearGradient>

        {/* Frosted Glass Rim Border */}
        <linearGradient id={`${uniqueId}-rim`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            stop-color={isLight() ? pal().primary || "#ef6351" : "#ffffff"}
            stop-opacity={isLight() ? "0.35" : "0.45"}
          />
          <stop
            offset="40%"
            stop-color={pal().primaryLight || "#f7a399"}
            stop-opacity={isLight() ? "0.2" : "0.15"}
          />
          <stop
            offset="100%"
            stop-color={pal().primary || "#ef6351"}
            stop-opacity="0.05"
          />
        </linearGradient>

        {/* Ambient Acoustic Bloom */}
        <radialGradient id={`${uniqueId}-bloom`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color={pal().primary || "#ef6351"} stop-opacity={isLight() ? "0.2" : "0.38"} />
          <stop offset="45%" stop-color={pal().primaryLight || "#f38375"} stop-opacity={isLight() ? "0.08" : "0.14"} />
          <stop offset="100%" stop-color={pal().primary || "#ef6351"} stop-opacity="0" />
        </radialGradient>

        {/* High-Intensity Neon Glow Filter for the Electric String */}
        <filter id={`${uniqueId}-bloom-filt`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur2" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur3" />
          <feMerge>
            <feMergeNode in="blur3" />
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Waveform Shadow */}
        <filter id={`${uniqueId}-wave-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="12"
            flood-color={pal().primary || "#ef6351"}
            flood-opacity={isLight() ? "0.18" : "0.32"}
          />
        </filter>
      </defs>

      {/* 1. Master Squircle Canvas */}
      <rect width="512" height="512" rx="116" fill={`url(#${uniqueId}-bg)`} />

      {/* 2. Ambient Acoustic Bloom */}
      <circle cx="256" cy="265" r="185" fill={`url(#${uniqueId}-bloom)`} />

      {/* 3. Precision Frosted Rim Border */}
      <rect
        x="14"
        y="14"
        width="484"
        height="484"
        rx="104"
        fill="none"
        stroke={`url(#${uniqueId}-rim)`}
        stroke-width="2.5"
      />

      {/* 4. Acoustic Waveforms Created by the Vibrating String */}

      {/* Waveform Echo 1: Outward Sound Emission Ripple */}
      <path
        fill="none"
        stroke={`url(#${uniqueId}-echo)`}
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.4"
      >
        {animate() && (
          <>
            <animate
              attributeName="d"
              dur="3.2s"
              repeatCount="indefinite"
              values="
                M 85 125 C 100 170, 150 260, 256 430 C 362 260, 412 170, 427 125;
                M 75 115 C 95 160, 145 250, 256 445 C 367 250, 417 160, 437 115;
                M 85 125 C 100 170, 150 260, 256 430 C 362 260, 412 170, 427 125
              "
            />
            <animate
              attributeName="opacity"
              dur="3.2s"
              repeatCount="indefinite"
              values="0.45; 0.1; 0.45"
            />
          </>
        )}
      </path>

      {/* Waveform Echo 2: High-Frequency Secondary Ripple */}
      <path
        fill="none"
        stroke={pal().primaryLight || "#f7a399"}
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="8 6"
        opacity="0.3"
      >
        {animate() && (
          <>
            <animate
              attributeName="d"
              dur="2.4s"
              repeatCount="indefinite"
              values="
                M 95 135 C 110 180, 160 270, 256 420 C 352 270, 402 180, 417 135;
                M 105 145 C 118 190, 168 280, 256 410 C 344 280, 394 190, 407 145;
                M 95 135 C 110 180, 160 270, 256 420 C 352 270, 402 180, 417 135
              "
            />
            <animate
              attributeName="stroke-dashoffset"
              dur="4s"
              repeatCount="indefinite"
              values="0; 60"
            />
          </>
        )}
      </path>

      {/* Concentric Sonar Rings Radiating Downward from the Apex */}
      <g fill="none" stroke={pal().primary || "#ef6351"} stroke-linecap="round">
        <circle cx="256" cy="395" r="28" stroke-width="2.5" opacity="0.6">
          {animate() && (
            <>
              <animate attributeName="r" values="18; 75" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7; 0" dur="2.4s" repeatCount="indefinite" />
            </>
          )}
        </circle>
        <circle cx="256" cy="395" r="28" stroke-width="2" opacity="0.6">
          {animate() && (
            <>
              <animate attributeName="r" values="18; 75" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7; 0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
            </>
          )}
        </circle>
      </g>

      {/* Central Acoustic Spectrum Waves */}
      <g fill="none" stroke-linecap="round" opacity="0.9" filter={`url(#${uniqueId}-wave-shadow)`}>
        {/* Harmonic Wave 1 (Center) */}
        <path stroke={pal().logoWave || "#ffe3e0"} stroke-width="4.5">
          {animate() && (
            <animate
              attributeName="d"
              dur="1.6s"
              repeatCount="indefinite"
              values="
                M 256 160 L 256 340;
                M 256 185 L 256 315;
                M 256 145 L 256 355;
                M 256 160 L 256 340
              "
            />
          )}
        </path>
        {/* Harmonic Wave 2 (Left Inner) */}
        <path stroke={pal().primaryLight || "#f7a399"} stroke-width="4">
          {animate() && (
            <animate
              attributeName="d"
              dur="1.9s"
              repeatCount="indefinite"
              values="
                M 234 195 L 234 325;
                M 234 165 L 234 350;
                M 234 215 L 234 305;
                M 234 195 L 234 325
              "
            />
          )}
        </path>
        {/* Harmonic Wave 3 (Right Inner) */}
        <path stroke={pal().primaryLight || "#f7a399"} stroke-width="4">
          {animate() && (
            <animate
              attributeName="d"
              dur="1.7s"
              repeatCount="indefinite"
              values="
                M 278 200 L 278 320;
                M 278 220 L 278 300;
                M 278 170 L 278 345;
                M 278 200 L 278 320
              "
            />
          )}
        </path>
        {/* Harmonic Wave 4 (Left Outer) */}
        <path stroke={pal().primary || "#f38375"} stroke-width="3.5">
          {animate() && (
            <animate
              attributeName="d"
              dur="2.1s"
              repeatCount="indefinite"
              values="
                M 212 230 L 212 300;
                M 212 210 L 212 320;
                M 212 245 L 212 285;
                M 212 230 L 212 300
              "
            />
          )}
        </path>
        {/* Harmonic Wave 5 (Right Outer) */}
        <path stroke={pal().primary || "#f38375"} stroke-width="3.5">
          {animate() && (
            <animate
              attributeName="d"
              dur="2.3s"
              repeatCount="indefinite"
              values="
                M 300 235 L 300 295;
                M 300 250 L 300 280;
                M 300 215 L 300 315;
                M 300 235 L 300 295
              "
            />
          )}
        </path>
      </g>

      {/* 5. The Animated String Creating & Writing the 'V' */}

      {/* A. Sub-String Baseline */}
      <path
        d="M 112 148 L 256 392 L 400 148"
        fill="none"
        stroke={pal().primary || "#ef6351"}
        stroke-width="10"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity={isLight() ? "0.25" : "0.35"}
      />

      {/* B. The Living Vibrating String */}
      <path
        fill="none"
        stroke={`url(#${uniqueId}-laser)`}
        stroke-width="12"
        stroke-linecap="round"
        stroke-linejoin="round"
        filter={`url(#${uniqueId}-bloom-filt)`}
      >
        {animate() && (
          <animate
            attributeName="d"
            dur="2.2s"
            repeatCount="indefinite"
            values="
              M 112 148 Q 128 205, 150 250 Q 182 315, 214 360 Q 236 388, 256 392 Q 276 388, 298 360 Q 330 315, 362 250 Q 384 205, 400 148;
              M 112 148 Q 118 190, 162 238 Q 172 328, 222 348 Q 238 396, 256 392 Q 274 380, 290 372 Q 340 302, 350 262 Q 394 200, 400 148;
              M 112 148 Q 138 220, 138 262 Q 192 302, 206 372 Q 234 380, 256 392 Q 274 396, 290 348 Q 340 328, 350 238 Q 394 190, 400 148;
              M 112 148 Q 124 195, 154 245 Q 178 320, 210 355 Q 234 390, 256 392 Q 278 390, 302 355 Q 334 320, 358 245 Q 388 195, 400 148;
              M 112 148 Q 128 205, 150 250 Q 182 315, 214 360 Q 236 388, 256 392 Q 276 388, 298 360 Q 330 315, 362 250 Q 384 205, 400 148
            "
          />
        )}
      </path>

      {/* C. The Continuous Laser String Writing Pulse */}
      <path
        d="M 112 148 L 256 392 L 400 148"
        fill="none"
        stroke="#ffffff"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="140 580"
        filter={`url(#${uniqueId}-bloom-filt)`}
      >
        {animate() && (
          <animate
            attributeName="stroke-dashoffset"
            values="720; 0"
            dur="1.8s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* D. Radiant Spark Head & Vertex Anchor Nodes */}
      <g filter={`url(#${uniqueId}-bloom-filt)`}>
        <circle cx="112" cy="148" r="6" fill={pal().logoWave || "#ffe3e0"}>
          {animate() && (
            <>
              <animate attributeName="r" values="5; 8; 5" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8; 1; 0.8" dur="1.4s" repeatCount="indefinite" />
            </>
          )}
        </circle>
        <circle cx="400" cy="148" r="6" fill={pal().logoWave || "#ffe3e0"}>
          {animate() && (
            <>
              <animate attributeName="r" values="5; 8; 5" dur="1.4s" begin="0.7s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8; 1; 0.8" dur="1.4s" begin="0.7s" repeatCount="indefinite" />
            </>
          )}
        </circle>
        <circle cx="256" cy="392" r="8" fill="#ffffff">
          {animate() && (
            <animate attributeName="r" values="7; 12; 7" dur="0.9s" repeatCount="indefinite" />
          )}
        </circle>
      </g>
    </svg>
  );
};

export default DynamicAppLogo;
