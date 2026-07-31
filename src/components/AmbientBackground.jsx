import React, { useEffect, useState } from 'react';

/**
 * AmbientBackground component provides a GPU-accelerated, high-performance,
 * pure CSS background. It features smooth gradient orbs and dynamically
 * generates a blurred ambient backlight of the uploaded image at the top
 * of the screen to create an immersive, Apple Music / Spotify style visual experience.
 */
export default function AmbientBackground({ imagePreview }) {
  const [activeImage, setActiveImage] = useState(imagePreview);
  const [fadeState, setFadeState] = useState('in');

  useEffect(() => {
    if (imagePreview !== activeImage) {
      // Trigger a smooth cross-fade animation when the image changes
      setFadeState('out');
      const timer = setTimeout(() => {
        setActiveImage(imagePreview);
        setFadeState('in');
      }, 300); // matches the transition-all transition duration
      return () => clearTimeout(timer);
    }
  }, [imagePreview, activeImage]);

  return (
    <div className="fixed inset-0 -z-10 bg-[#030712] overflow-hidden pointer-events-none select-none">
      {/* Base radial gradients */}
      <div className="absolute top-0 left-0 right-0 h-[60vh] bg-gradient-to-b from-[#080f25]/50 to-transparent opacity-60" />

      {/* Tech Grid Pattern (Very subtle, 0.03 opacity) */}
      <div 
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Dynamic Ambient Blur Backdrop of the Curation Image */}
      {activeImage && (
        <div 
          className={`absolute top-[-10%] left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] md:w-[75vw] md:h-[65vh] rounded-[100%] blur-[120px] saturate-[1.65] opacity-25 transition-all duration-500 ease-out pointer-events-none select-none scale-105 ${
            fadeState === 'in' ? 'scale-100 opacity-25' : 'scale-95 opacity-0'
          }`}
          style={{
            backgroundImage: `url(${activeImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Ambient Glow Orbs (GPU-accelerated, pulse animation) */}
      {/* Glowing Orb 1: Cyan/Teal */}
      <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-soft pointer-events-none" />
      
      {/* Glowing Orb 2: Violet/Purple */}
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[130px] animate-pulse-soft pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* Subtle vignette layer */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{ background: 'radial-gradient(circle at center, transparent 30%, #030712 95%)' }}
      />
    </div>
  );
}
