import React, { useEffect, useRef, useState } from 'react';

/**
 * AmbientBackground component provides a highly optimized, high-performance visual backdrop:
 * 1. A GPU-accelerated CSS-based organic Gemini AI morphing glow.
 * 2. An ambient blurred backlight of the uploaded photo that dynamically adapts to the photo's colors.
 * 3. A 3D interactive WebGL Particle wave landscape (nebula visualizer) built on Three.js,
 *    which morphs organically and reacts directly to music playback state (isPlaying).
 */
export default function AmbientBackground({ imagePreview, isPlaying }) {
  const containerRef = useRef(null);
  const [activeImage, setActiveImage] = useState(imagePreview);
  const [fadeState, setFadeState] = useState('in');

  // Sync image changes with cross-fade animation
  useEffect(() => {
    if (imagePreview !== activeImage) {
      setFadeState('out');
      const timer = setTimeout(() => {
        setActiveImage(imagePreview);
        setFadeState('in');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [imagePreview, activeImage]);

  // Three.js 3D Particle Wave visualizer
  useEffect(() => {
    if (!window.THREE) {
      console.warn("Three.js is not loaded.");
      return;
    }

    const THREE = window.THREE;
    const container = containerRef.current;
    if (!container) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.z = 110;
    camera.position.y = 38; // Look down from slightly above
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 2. Generate custom glowing textures for soft circular particles
    const createParticleTexture = (colorStr) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, colorStr);
      gradient.addColorStop(0.5, colorStr.replace('1)', '0.3)'));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      return texture;
    };

    const tealTexture = createParticleTexture('rgba(6, 182, 212, 1)');

    // 3. Construct 3D Wave Grid
    const numParticles = 1200;
    const positions = new Float32Array(numParticles * 3);
    const colors = new Float32Array(numParticles * 3);

    // Grid details
    const cols = 40;
    const rows = 30;
    const spacingX = 4.5;
    const spacingZ = 4.5;

    const geometry = new THREE.BufferGeometry();

    let idx = 0;
    for (let x = 0; x < cols; x++) {
      for (let z = 0; z < rows; z++) {
        // Center the wave grid
        const posX = (x - cols / 2) * spacingX;
        const posZ = (z - rows / 2) * spacingZ;
        const posY = 0;

        positions[idx * 3] = posX;
        positions[idx * 3 + 1] = posY;
        positions[idx * 3 + 2] = posZ;

        // Assign colors dynamically based on grid coordinates
        const ratio = x / cols;
        let r = 0, g = 0, b = 0;
        if (ratio < 0.33) {
          // Teal dominant
          r = 0.02; g = 0.71; b = 0.83;
        } else if (ratio < 0.66) {
          // Violet dominant
          r = 0.54; g = 0.36; b = 0.96;
        } else {
          // Pink dominant
          r = 0.92; g = 0.28; b = 0.6;
        }

        colors[idx * 3] = r;
        colors[idx * 3 + 1] = g;
        colors[idx * 3 + 2] = b;

        idx++;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Choose the mapped texture with additive blending
    const material = new THREE.PointsMaterial({
      size: 5.0,
      map: tealTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });

    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // 4. Mouse movement tracking for cursor gravity attraction
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (event) => {
      targetMouseX = (event.clientX - window.innerWidth / 2) * 0.05;
      targetMouseY = (event.clientY - window.innerHeight / 2) * 0.05;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 5. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const waveSpeed = isPlaying ? 2.5 : 0.8;
      const waveHeight = isPlaying ? 11.0 : 4.0;
      const noiseFreq = isPlaying ? 0.15 : 0.08;

      // Smooth mouse follow
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      // Slightly tilt camera based on mouse
      camera.position.x = mouseX * 0.4;
      camera.position.y = 38 + (mouseY * 0.2);
      camera.lookAt(0, 0, 0);

      // Access particle position array
      const posAttr = geometry.attributes.position;
      const posArray = posAttr.array;

      for (let i = 0; i < numParticles; i++) {
        const posX = posArray[i * 3];
        const posZ = posArray[i * 3 + 2];

        // Complex multi-layered mathematical sine wave equation
        const angle1 = (posX * noiseFreq) + (elapsedTime * waveSpeed);
        const angle2 = (posZ * noiseFreq * 1.2) + (elapsedTime * waveSpeed * 0.8);
        const angle3 = (Math.sqrt(posX * posX + posZ * posZ) * 0.04) - (elapsedTime * waveSpeed * 1.1);

        // Compute Y coordinate
        let posY = Math.sin(angle1) * waveHeight;
        posY += Math.cos(angle2) * (waveHeight * 0.6);
        posY += Math.sin(angle3) * (waveHeight * 0.4);

        // Mouse cursor pull attraction
        const distToMouse = Math.sqrt(Math.pow(posX - mouseX, 2) + Math.pow(posZ - mouseY, 2));
        if (distToMouse < 40) {
          const attractionForce = (40 - distToMouse) * 0.15;
          posY += attractionForce * (isPlaying ? 1.5 : 1.0);
        }

        posArray[i * 3 + 1] = posY;
      }

      posAttr.needsUpdate = true;

      // Slow orbital rotate system
      particleSystem.rotation.y = elapsedTime * 0.02;

      renderer.render(scene, camera);
    };
    animate();

    // 6. Resize listener
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup resources
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      
      geometry.dispose();
      material.dispose();
      tealTexture.dispose();
      renderer.dispose();
    };
  }, [isPlaying]);

  return (
    <>
      {/* CSS-based keyframe animations for the Gemini Glow */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gemini-glow-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(12%, 15%) scale(1.15); }
          66% { transform: translate(-8%, -12%) scale(0.92); }
        }
        @keyframes gemini-glow-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-15%, -8%) scale(0.85); }
          66% { transform: translate(10%, 15%) scale(1.2); }
        }
        @keyframes gemini-glow-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1.1); }
          50% { transform: translate(-12%, 8%) scale(0.95); }
        }
        @keyframes gemini-glow-4 {
          0%, 100% { transform: translate(0px, 0px) scale(0.9); }
          50% { transform: translate(15%, -15%) scale(1.15); }
        }
        .animate-gemini-glow-1 {
          animation: gemini-glow-1 16s ease-in-out infinite;
        }
        .animate-gemini-glow-2 {
          animation: gemini-glow-2 20s ease-in-out infinite;
        }
        .animate-gemini-glow-3 {
          animation: gemini-glow-3 18s ease-in-out infinite;
        }
        .animate-gemini-glow-4 {
          animation: gemini-glow-4 22s ease-in-out infinite;
        }
      `}} />

      <div className="fixed inset-0 -z-10 bg-[#02050f] overflow-hidden pointer-events-none select-none">
        
        {/* Gemini AI Organic Morphing Glow */}
        <div className="absolute inset-0 overflow-hidden opacity-90 pointer-events-none select-none">
          <div className="absolute w-[60vw] h-[60vw] rounded-full bg-emerald-500/12 blur-[120px] animate-gemini-glow-1 top-[-10%] left-[-15%]" />
          <div className="absolute w-[55vw] h-[55vw] rounded-full bg-cyan-500/12 blur-[120px] animate-gemini-glow-2 top-[15%] right-[-10%]" />
          <div className="absolute w-[65vw] h-[65vw] rounded-full bg-violet-600/8 blur-[130px] animate-gemini-glow-3 bottom-[-15%] left-[10%]" />
          <div className="absolute w-[45vw] h-[45vw] rounded-full bg-lime-400/8 blur-[110px] animate-gemini-glow-4 top-[-15%] right-[20%]" />
        </div>

        {/* Subtle grid backdrop */}
        <div 
          className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '56px 56px',
          }}
        />

        {/* Ambient image glow layer (faded behind) */}
        {activeImage && (
          <div 
            className={`absolute top-[-15%] left-1/2 -translate-x-1/2 w-[130vw] h-[65vh] md:w-[80vw] md:h-[70vh] rounded-[100%] blur-[120px] saturate-[1.6] transition-all duration-700 ease-out pointer-events-none scale-105 ${
              fadeState === 'in' ? 'scale-100 opacity-[0.22]' : 'scale-95 opacity-0'
            }`}
            style={{
              backgroundImage: `url(${activeImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}

        {/* 3D WebGL Canvas Layer for morphing wave particles */}
        <div 
          ref={containerRef} 
          className="absolute inset-0 w-full h-full pointer-events-none" 
        />

        {/* Vignette layer for rich cinematic contrast */}
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{ background: 'radial-gradient(circle at center, transparent 35%, #02050f 98%)' }}
        />
      </div>
    </>
  );
}
