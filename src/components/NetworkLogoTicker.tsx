'use client'

import { useEffect, useState } from 'react'

interface Logo {
  id: number
  name: string
  image_url: string
}

// Fallback logos from public directory (used when DB table doesn't exist yet)
const FALLBACK_LOGOS: Logo[] = [
  { id: 1, name: 'Netflix', image_url: '/images/logos/netflix.svg' },
  { id: 2, name: 'Disney+', image_url: '/images/logos/disney.svg' },
  { id: 3, name: 'Max', image_url: '/images/logos/hbo.svg' },
  { id: 4, name: 'ITV Studios', image_url: '/images/logos/itv-studios.svg' },
  { id: 5, name: 'Paramount', image_url: '/images/logos/paramount.svg' },
  { id: 6, name: 'Warner Bros', image_url: '/images/logos/warner-bros.svg' },
  { id: 7, name: 'Lionsgate', image_url: '/images/logos/lionsgate.svg' },
  { id: 8, name: 'Sony Pictures', image_url: '/images/logos/sony-pictures.svg' },
]

export function NetworkLogoTicker() {
  const [logos, setLogos] = useState<Logo[]>(FALLBACK_LOGOS)

  useEffect(() => {
    fetch('/api/network-logos')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setLogos(data)
      })
      .catch(() => {
        // Keep fallback logos
      })
  }, [])

  if (logos.length === 0) return null

  // Duplicate logos enough times for seamless loop
  const duplicated = [...logos, ...logos, ...logos, ...logos]

  return (
    <section className="bg-[#111] border-b border-white/5 overflow-hidden py-5">
      <div className="relative">
        <div className="flex items-center animate-scroll-logos gap-16 whitespace-nowrap">
          {duplicated.map((logo, i) => (
            <div
              key={`${logo.id}-${i}`}
              className="flex-shrink-0 h-8 w-auto flex items-center"
            >
              <img
                src={logo.image_url}
                alt={logo.name}
                className="h-7 w-auto object-contain brightness-0 invert opacity-50 hover:opacity-90 transition-opacity duration-300"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-logos {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-logos {
          animation: scroll-logos ${logos.length * 4}s linear infinite;
        }
        .animate-scroll-logos:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  )
}
